package router

import (
	"time"

	"blendpos/internal/config"
	"blendpos/internal/handler"
	"blendpos/internal/infra"
	"blendpos/internal/middleware"
	"blendpos/internal/repository"
	"blendpos/internal/service"
	"blendpos/internal/worker"

	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// New wires all dependencies and returns a configured Gin engine.
// Dependency graph: Handler ← Service ← Repository ← DB/Redis
func New(cfg *config.Config, db *gorm.DB, rdb *redis.Client, afipCB *infra.CircuitBreaker) *gin.Engine {
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
	r.Use(middleware.RateLimiter(1000, time.Minute)) // 1000 req/min per IP

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
	historialPrecioRepo := repository.NewHistorialPrecioRepository(db)
	movimientoStockRepo := repository.NewMovimientoStockRepository(db)
	categoriaRepo := repository.NewCategoriaRepository(db)

	// ── Services ─────────────────────────────────────────────────────────────
	authSvc := service.NewAuthService(usuarioRepo, cfg)
	productoSvc := service.NewProductoService(productoRepo, movimientoStockRepo, rdb)
	inventarioSvc := service.NewInventarioService(productoRepo, movimientoStockRepo)
	cajaSvc := service.NewCajaService(cajaRepo)

	// Worker dispatcher — injected into services that enqueue async jobs
	dispatcher := worker.NewDispatcher(rdb, afipClient, mailer)

	ventaSvc := service.NewVentaService(ventaRepo, inventarioSvc, cajaSvc, cajaRepo, productoRepo, dispatcher)
	facturacionSvc := service.NewFacturacionService(comprobanteRepo, dispatcher)
	proveedorSvc := service.NewProveedorService(proveedorRepo, productoRepo)
	categoriaSvc := service.NewCategoriaService(categoriaRepo)

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
	historialPreciosH := handler.NewHistorialPreciosHandler(historialPrecioRepo)
	categoriasH := handler.NewCategoriasHandler(categoriaSvc)

	// ── Routes ───────────────────────────────────────────────────────────────

	// Public
	r.GET("/health", handler.Health(db, rdb, afipCB))

	// Auth (public)
	auth := r.Group("/v1/auth")
	{
		auth.POST("/login", middleware.LoginRateLimiter(), authH.Login)
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

		fact := v1.Group("/facturacion", middleware.RequireRole("administrador", "supervisor"))
		{
			fact.GET("/:venta_id", facturacionH.ObtenerComprobante)
			fact.GET("/pdf/:id", facturacionH.DescargarPDF)
			fact.DELETE("/:id", facturacionH.AnularComprobante)
			fact.POST("/:id/reintentar", facturacionH.ReintentarComprobante)
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
	}

	// Swagger UI — only enabled outside production
	if cfg.Env != "production" {
		r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}

	return r
}
