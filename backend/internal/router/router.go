package router

import (
	"blendpos/internal/config"
	"blendpos/internal/handler"
	"blendpos/internal/infra"
	"blendpos/internal/middleware"
	"blendpos/internal/repository"
	"blendpos/internal/service"
	"blendpos/internal/worker"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// New wires all dependencies and returns a configured Gin engine.
// Dependency graph: Handler ← Service ← Repository ← DB/Redis
func New(cfg *config.Config, db *gorm.DB, rdb *redis.Client) *gin.Engine {
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()

	// Global middleware chain (order matters)
	r.Use(middleware.RequestID())
	r.Use(middleware.Logger())
	r.Use(middleware.Recovery())
	r.Use(middleware.CORS())
	r.Use(middleware.ErrorHandler())

	// ── Infrastructure ───────────────────────────────────────────────────────
	afipClient := infra.NewAFIPClient(cfg.AFIPSidecarURL)
	mailer := infra.NewMailer(cfg)

	// ── Repositories ─────────────────────────────────────────────────────────
	usuarioRepo := repository.NewUsuarioRepository(db)
	productoRepo := repository.NewProductoRepository(db)
	ventaRepo := repository.NewVentaRepository(db)
	cajaRepo := repository.NewCajaRepository(db)
	comprobanteRepo := repository.NewComprobanteRepository(db)
	proveedorRepo := repository.NewProveedorRepository(db)

	// ── Services ─────────────────────────────────────────────────────────────
	authSvc := service.NewAuthService(usuarioRepo, cfg)
	productoSvc := service.NewProductoService(productoRepo, rdb)
	inventarioSvc := service.NewInventarioService(productoRepo)
	cajaSvc := service.NewCajaService(cajaRepo)

	// Worker dispatcher — injected into services that enqueue async jobs
	dispatcher := worker.NewDispatcher(rdb, afipClient, mailer)

	ventaSvc := service.NewVentaService(ventaRepo, inventarioSvc, cajaSvc, cajaRepo, productoRepo, dispatcher)
	facturacionSvc := service.NewFacturacionService(comprobanteRepo, dispatcher)
	proveedorSvc := service.NewProveedorService(proveedorRepo, productoRepo)

	// ── Handlers ─────────────────────────────────────────────────────────────
	authH := handler.NewAuthHandler(authSvc)
	productosH := handler.NewProductosHandler(productoSvc)
	inventarioH := handler.NewInventarioHandler(inventarioSvc)
	ventasH := handler.NewVentasHandler(ventaSvc)
	cajaH := handler.NewCajaHandler(cajaSvc)
	facturacionH := handler.NewFacturacionHandler(facturacionSvc)
	proveedoresH := handler.NewProveedoresHandler(proveedorSvc)
	usuariosH := handler.NewUsuariosHandler(authSvc)
	consultaH := handler.NewConsultaPreciosHandler(productoRepo, rdb)

	// ── Routes ───────────────────────────────────────────────────────────────

	// Public
	r.GET("/health", handler.Health(db, rdb))

	// Auth (public)
	auth := r.Group("/v1/auth")
	{
		auth.POST("/login", authH.Login)
		auth.POST("/refresh", authH.Refresh)
	}

	// Price check — no auth required (RF-27)
	r.GET("/v1/precio/:barcode", consultaH.GetPrecioPorBarcode)

	// Protected routes
	jwtMW := middleware.JWTAuth(cfg.JWTSecret)
	v1 := r.Group("/v1", jwtMW)
	{
		// Roles: cajero, supervisor, administrador — declared per-endpoint
		v1.POST("/ventas", middleware.RequireRole("cajero", "supervisor", "administrador"), ventasH.RegistrarVenta)
		v1.DELETE("/ventas/:id", middleware.RequireRole("supervisor", "administrador"), ventasH.AnularVenta)

		prods := v1.Group("/productos", middleware.RequireRole("administrador"))
		{
			prods.POST("", productosH.Crear)
			prods.GET("", productosH.Listar)
			prods.GET("/:id", productosH.ObtenerPorID)
			prods.PUT("/:id", productosH.Actualizar)
			prods.DELETE("/:id", productosH.Desactivar)
		}

		inv := v1.Group("/inventario", middleware.RequireRole("administrador", "supervisor"))
		{
			inv.POST("/vinculos", inventarioH.CrearVinculo)
			inv.GET("/vinculos", inventarioH.ListarVinculos)
			inv.POST("/desarme", inventarioH.DesarmeManual)
			inv.GET("/alertas", inventarioH.ObtenerAlertas)
		}

		caja := v1.Group("/caja")
		{
			caja.POST("/abrir", middleware.RequireRole("cajero", "supervisor", "administrador"), cajaH.Abrir)
			caja.POST("/arqueo", middleware.RequireRole("cajero", "supervisor", "administrador"), cajaH.Arqueo)
			caja.GET("/:id/reporte", middleware.RequireRole("cajero", "supervisor", "administrador"), cajaH.ObtenerReporte)
			caja.POST("/movimiento", middleware.RequireRole("cajero", "supervisor", "administrador"), cajaH.RegistrarMovimiento)
		}

		fact := v1.Group("/facturacion", middleware.RequireRole("administrador", "supervisor"))
		{
			fact.GET("/:venta_id", facturacionH.ObtenerComprobante)
			fact.GET("/pdf/:id", facturacionH.DescargarPDF)
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
		}

		// Offline sync endpoint (PWA SyncEngine)
		v1.POST("/ventas/sync-batch", middleware.RequireRole("cajero", "supervisor", "administrador"), ventasH.SyncBatch)
	}

	return r
}
