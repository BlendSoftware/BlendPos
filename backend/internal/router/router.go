package router

import (
	"strings"
	"time"

	"blendpos/internal/config"
	"blendpos/internal/handler"
	"blendpos/internal/infra"
	"blendpos/internal/middleware"
	"blendpos/internal/repository"
	"blendpos/internal/service"

	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// Deps bundles every dependency the router needs.
// All repositories, services and infrastructure are created in main.go
// (the sole composition root) and injected here.
type Deps struct {
	Cfg    *config.Config
	DB     *gorm.DB
	RDB    *redis.Client
	AfipCB *infra.CircuitBreaker

	// Services
	AuthSvc         service.AuthService
	ProductoSvc     service.ProductoService
	InventarioSvc   service.InventarioService
	VentaSvc        service.VentaService
	CajaSvc         service.CajaService
	FacturacionSvc  service.FacturacionService
	ConfigFiscalSvc service.ConfiguracionFiscalService
	ProveedorSvc    service.ProveedorService
	CategoriaSvc    service.CategoriaService
	AuditSvc        service.AuditService
	CompraSvc       service.CompraService
	PromocionSvc    service.PromocionService

	// Repos still needed by handlers that bypass the service layer
	ProductoRepo        repository.ProductoRepository
	HistorialPrecioRepo repository.HistorialPrecioRepository
	AuditRepo           repository.AuditRepository
	ComprobanteRepo     repository.ComprobanteRepository
	VentaRepo           repository.VentaRepository

	// Worker dispatcher for email/facturacion jobs
	Dispatcher interface{}
}

// New wires handlers and registers routes. It does NOT create infrastructure,
// repositories or services — that is the responsibility of main.go (S-05).
func New(d Deps) *gin.Engine {
	cfg := d.Cfg

	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()

	// Global middleware chain (order matters)
	r.Use(middleware.MaxBodySize(10 << 20))   // 10 MB default body limit (S-07)
	r.Use(gzip.Gzip(gzip.DefaultCompression)) // 7.5 — compress JSON responses (saves ~70% on product lists)
	r.Use(middleware.RequestID())
	r.Use(middleware.Logger())
	r.Use(middleware.Recovery())
	origins := strings.Split(cfg.AllowedOrigins, ",")
	r.Use(middleware.CORS(origins))
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.GlobalTimeout(30 * time.Second))
	r.Use(middleware.ErrorHandler())
	r.Use(middleware.RateLimiter(d.RDB, 1000, time.Minute)) // 1000 req/min per IP (Redis-backed)

	// ── Handlers ─────────────────────────────────────────────────────────────
	authH := handler.NewAuthHandler(d.AuthSvc)
	productosH := handler.NewProductosHandler(d.ProductoSvc)
	inventarioH := handler.NewInventarioHandler(d.InventarioSvc)
	ventasH := handler.NewVentasHandler(d.VentaSvc)
	cajaH := handler.NewCajaHandler(d.CajaSvc)
	facturacionH := handler.NewFacturacionHandler(d.FacturacionSvc, cfg.PDFStoragePath, d.ComprobanteRepo, d.VentaRepo, d.ConfigFiscalSvc)
	facturacionH.SetDispatcher(d.Dispatcher) // Inyectar dispatcher para envío de emails
	proveedoresH := handler.NewProveedoresHandler(d.ProveedorSvc)
	usuariosH := handler.NewUsuariosHandler(d.AuthSvc)
	consultaH := handler.NewConsultaPreciosHandler(d.ProductoRepo, d.RDB)
	historialPreciosH := handler.NewHistorialPreciosHandler(d.HistorialPrecioRepo)
	categoriasH := handler.NewCategoriasHandler(d.CategoriaSvc)
	auditH := handler.NewAuditHandler(d.AuditRepo)
	configFiscalH := handler.NewConfiguracionFiscalHandler(d.ConfigFiscalSvc)
	comprasH := handler.NewCompraHandler(d.CompraSvc)

	// ── Routes ───────────────────────────────────────────────────────────────

	// Public
	r.GET("/health", handler.Health(d.DB, d.RDB, d.AfipCB, cfg))

	// Auth (public)
	auth := r.Group("/v1/auth")
	{
		auth.POST("/login", middleware.LoginRateLimiter(d.RDB), authH.Login)
		auth.POST("/refresh", middleware.RefreshRateLimiter(d.RDB), authH.Refresh)
	}

	// Price check — no auth required (RF-27)
	// Dedicated rate limit: 60 req/min per IP to prevent catalog scraping.
	r.GET("/v1/precio/:barcode", middleware.RateLimiter(d.RDB, 60, time.Minute), consultaH.GetPrecioPorBarcode)

	// Protected routes
	jwtMW := middleware.JWTAuth(cfg.JWTSecret, d.RDB)

	// Authenticated logout — requires a valid (non-revoked) token
	auth.POST("/logout", jwtMW, authH.Logout)
	auth.POST("/change-password", jwtMW, authH.ChangePassword)

	v1 := r.Group("/v1", jwtMW)
	v1.Use(middleware.AuditMiddleware(d.AuditSvc))
	{
		// Roles: cajero, supervisor, administrador — declared per-endpoint
		v1.POST("/ventas", middleware.RequireRole("cajero", "supervisor", "administrador"), ventasH.RegistrarVenta)
		v1.GET("/ventas", middleware.RequireRole("cajero", "supervisor", "administrador"), ventasH.ListarVentas)
		v1.DELETE("/ventas/:id", middleware.RequireRole("supervisor", "administrador"), ventasH.AnularVenta)

		// GET /v1/productos — cajero/supervisor/administrador can read (catalog sync)
		v1.GET("/productos", middleware.RequireRole("cajero", "supervisor", "administrador"), productosH.Listar)
		v1.GET("/productos/:id", middleware.RequireRole("cajero", "supervisor", "administrador"), productosH.ObtenerPorID)
		v1.GET("/productos/:id/historial-precios", middleware.RequireRole("cajero", "supervisor", "administrador"), historialPreciosH.ListarPorProducto)
		// PATCH stock — supervisor or administrador
		v1.PATCH("/productos/:id/stock", middleware.RequireRole("supervisor", "administrador"), productosH.AjustarStock)
		// Write operations — administrador only
		prods := v1.Group("/productos", middleware.RequireRole("administrador"))
		{
			prods.POST("", productosH.Crear)
			prods.PUT("/:id", productosH.Actualizar)
			prods.DELETE("/:id", productosH.Desactivar)
			prods.PATCH("/:id/reactivar", productosH.Reactivar)
		}

		inv := v1.Group("/inventario", middleware.RequireRole("administrador", "supervisor"))
		{
			inv.POST("/vinculos", inventarioH.CrearVinculo)
			inv.GET("/vinculos", inventarioH.ListarVinculos)
			inv.POST("/desarme", inventarioH.DesarmeManual)
			inv.GET("/alertas", inventarioH.ObtenerAlertas)
			inv.GET("/movimientos", inventarioH.ListarMovimientos)
		}

		caja := v1.Group("/caja")
		{
			caja.POST("/abrir", middleware.RequireRole("cajero", "supervisor", "administrador"), cajaH.Abrir)
			caja.POST("/arqueo", middleware.RequireRole("cajero", "supervisor", "administrador"), cajaH.Arqueo)
			caja.GET("/:id/reporte", middleware.RequireRole("cajero", "supervisor", "administrador"), cajaH.ObtenerReporte)
			caja.POST("/movimiento", middleware.RequireRole("cajero", "supervisor", "administrador"), cajaH.RegistrarMovimiento)
			caja.GET("/activa", middleware.RequireRole("cajero", "supervisor", "administrador"), cajaH.GetActiva)
			caja.GET("/historial", middleware.RequireRole("supervisor", "administrador"), cajaH.Historial)
		}

		// Read-only: cajero can check their own comprobante status and download it
		factR := v1.Group("/facturacion", middleware.RequireRole("cajero", "supervisor", "administrador"))
		{
			factR.GET("/:venta_id", facturacionH.ObtenerComprobante)
			factR.GET("/pdf/:id", facturacionH.DescargarPDF)
			factR.GET("/html/:id", facturacionH.ObtenerHTML)
			factR.POST("/:id/enviar-email", facturacionH.EnviarEmailComprobante)
		}
		// Write operations: admin/supervisor only
		factW := v1.Group("/facturacion", middleware.RequireRole("administrador", "supervisor"))
		{
			factW.DELETE("/:id", facturacionH.AnularComprobante)
			factW.POST("/:id/reintentar", facturacionH.ReintentarComprobante)
			factW.POST("/:id/regen-pdf", facturacionH.RegenerarPDF)
		}

		prov := v1.Group("/proveedores", middleware.RequireRole("administrador"))
		{
			prov.POST("", proveedoresH.Crear)
			prov.GET("", proveedoresH.Listar)
			prov.GET("/:id", proveedoresH.ObtenerPorID)
			prov.PUT("/:id", proveedoresH.Actualizar)
			prov.DELETE("/:id", proveedoresH.Eliminar)
			prov.POST("/:id/precios/masivo", proveedoresH.ActualizarPreciosMasivo)
		}

		v1.POST("/csv/import", middleware.RequireRole("administrador"), proveedoresH.ImportarCSV)

		usuarios := v1.Group("/usuarios", middleware.RequireRole("administrador"))
		{
			usuarios.POST("", usuariosH.Crear)
			usuarios.GET("", usuariosH.Listar)
			usuarios.PUT("/:id", usuariosH.Actualizar)
			usuarios.DELETE("/:id", usuariosH.Desactivar)
			usuarios.PATCH("/:id/reactivar", usuariosH.Reactivar)
		}

		// Offline sync endpoint (PWA SyncEngine)
		v1.POST("/ventas/sync-batch", middleware.RequireRole("cajero", "supervisor", "administrador"), ventasH.SyncBatch)

		// Categorías — administrador can write, all authenticated can read
		v1.GET("/categorias", middleware.RequireRole("cajero", "supervisor", "administrador"), categoriasH.Listar)
		categorias := v1.Group("/categorias", middleware.RequireRole("administrador"))
		{
			categorias.POST("", categoriasH.Crear)
			categorias.PUT("/:id", categoriasH.Actualizar)
			categorias.DELETE("/:id", categoriasH.Desactivar)
		}

		// Audit log — read-only, admin only (Q-03)
		v1.GET("/audit", middleware.RequireRole("administrador"), auditH.List)

		// Configuración fiscal — admin only (AFIP parameters)
		configFiscal := v1.Group("/configuracion/fiscal", middleware.RequireRole("administrador"))
		{
			configFiscal.GET("", configFiscalH.Obtener)
			configFiscal.PUT("", configFiscalH.Actualizar)
		}

		// Compras — administrador can write, supervisor can read
		v1.GET("/compras", middleware.RequireRole("supervisor", "administrador"), comprasH.Listar)
		v1.GET("/compras/:id", middleware.RequireRole("supervisor", "administrador"), comprasH.ObtenerPorID)
		compras := v1.Group("/compras", middleware.RequireRole("administrador"))
		{
			compras.POST("", comprasH.Crear)
			compras.PATCH(":id/estado", comprasH.ActualizarEstado)
		}
	}

	// Swagger UI — only enabled outside production
	if cfg.Env != "production" {
		r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}

	return r
}
