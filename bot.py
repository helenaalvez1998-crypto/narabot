"status": "online",
                "discord_connected": self.is_ready(),
                "database": "connected",
            })

        app = web.Application(client_max_size=42 * 1024 * 1024)
        app.router.add_get("/", pagina_inicial)
        app.router.add_get("/style.css", estilo_site)
        app.router.add_get("/eden-ui.css", elden_ui_css)
        app.router.add_get("/efeitos-visuais.js", efeitos_visuais_js)
        app.router.add_get("/narabot-visual-v59.css", narabot_visual_css)
        app.router.add_get("/app.js", script_site)
        assets_dir = site_dir / "assets"
        if assets_dir.is_dir():
            app.router.add_static("/assets/", str(assets_dir), show_index=False)
        app.router.add_get("/api/status", status_api)