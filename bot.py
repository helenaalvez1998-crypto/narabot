"""Entrypoint e ciclo de vida do NARA.

Start command recomendado (FadeHost): python bot.py
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import sys
import hmac
import hashlib
import json
import secrets
import time
from urllib.parse import quote, urlencode, urlsplit

import threading
import traceback
from io import BytesIO
from pathlib import Path
from typing import Any

import discord
import aiohttp
from aiohttp import web
from discord import app_commands
from discord.ext import commands

import config
from database import Database


LOG_LEVEL = getattr(logging, config.LOG_LEVEL, logging.INFO)
try:
    from zoneinfo import ZoneInfo
    FUSO_LOG = ZoneInfo("America/Sao_Paulo")  # horário de Brasília
except Exception:  # sem tzdata: Brasília é UTC-3 fixo (sem horário de verão desde 2019)
    from datetime import timedelta, timezone
    FUSO_LOG = timezone(timedelta(hours=-3), "BRT")


class _FormatterBrasilia(logging.Formatter):
    """Carimba os logs no horário de Brasília, independente do fuso do servidor."""

    def formatTime(self, record, datefmt=None):
        from datetime import datetime
        momento = datetime.fromtimestamp(record.created, tz=FUSO_LOG)
        return momento.strftime(datefmt or "%Y-%m-%d %H:%M:%S %Z")


logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s %(levelname)s %(name)s: %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("nara")


class NaraBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(command_prefix="!", intents=intents)

    async def setup_hook(self):
        for arquivo in Path("cogs").glob("*.py"):
            if arquivo.stem.startswith("_"):
                continue
            try:
                await self.load_extension(f"cogs.{arquivo.stem}")
                log.info("Carregado cog: %s", arquivo.stem)
            except Exception as exc:
                log.exception("Falha ao carregar cog %s: %s", arquivo.stem, exc)

    async def on_ready(self):
        try:
            await self.tree.sync()
            log.info("Comandos de aplicação sincronizados.")
        except Exception:
            log.exception("Falha ao sincronizar comandos de aplicação.")
        log.info("NARABOT online como %s (ID %s)", self.user, self.user.id)

    async def on_command_error(self, ctx, error):
        log.error("Erro no comando %s: %s", ctx.command, error, exc_info=error)


# Função que roda o servidor web em thread separada
async def _run_web_server(app: web.Application, porta: str) -> None:
    """Executa o servidor web em loop async separado."""
    from aiohttp import web as _web
    runner = _web.AppRunner(app)
    await runner.setup()
    site = _web.TCPSite(runner, "0.0.0.0", int(porta))
    await site.start()
    # Mantém o loop rodando para sempre (a task não encerra)
    while True:
        await asyncio.sleep(3600)


# Rota do status da API
async def _status_api(request: web.Request) -> web.Response:
    return web.json_response({
        "service": "NaraBot-api",
        "status": "online",
        "discord_connected": True,
        "database": "connected",
    })


# Rota da página inicial
async def _pagina_inicial(request: web.Request) -> web.Response:
    index_file = Path("site/index.html")
    if not index_file.is_file():
        return web.Response(text="Site não encontrado.", status=404)
    return web.FileResponse(index_file)


# Rota do estilo CSS
async def _estilo_site(request: web.Request) -> web.Response:
    arquivo = Path("site/style.css")
    if not arquivo.is_file():
        raise web.HTTPNotFound(text="CSS do site não encontrado.")
    return web.FileResponse(arquivo)


# Rota do edên UI CSS
async def _elden_ui_css(request: web.Request) -> web.Response:
    arquivo = Path("site/elden-ui.css")
    if not arquivo.is_file():
        raise web.HTTPNotFound(text="Sistema visual V49 não encontrado.")
    return web.FileResponse(arquivo)


# Rota dos efeitos visuais (novo)
async def _efeitos_visuais_js(request: web.Request) -> web.Response:
    arquivo = Path("site/efeitos-visuais.js")
    if not arquivo.is_file():
        raise web.HTTPNotFound(text="Efeitos visuais não encontrados.")
    return web.FileResponse(arquivo)


# Rota da visual V59
async def _narabot_visual_css(request: web.Request) -> web.Response:
    arquivo = Path("site/narabot-visual-v59.css")
    if not arquivo.is_file():
        raise web.HTTPNotFound(text="Folha visual V59 não encontrada.")
    return web.FileResponse(arquivo)


# Rota do script do site
async def _script_site(request: web.Request) -> web.Response:
    arquivo = Path("site/app.js")
    if not arquivo.is_file():
        raise web.HTTPNotFound(text="JavaScript do site não encontrado.")
    return web.FileResponse(arquivo)


# Sinalizador de visual para o frontend
def _visual_signal(state: dict, user_id) -> dict | None:
    try:
        board_now = state.get("players", {}).get(str(user_id), {}).get("board", [])
        for u in board_now:
            if u.get("_efeito_ativado"):
                return {"type": "card_effect", "card_id": str(u.get("id", ""))}
    except Exception:
        pass
    return None


bot = NaraBot()


if __name__ == "__main__":
    import os as _os
    token = _os.getenv("DISCORD_TOKEN") or _os.getenv("DISCORD_BOT_TOKEN") or _os.getenv("BOT_TOKEN") or _os.getenv("TOKEN")
    if not token:
        log.error("Token do Discord não encontrado nas variáveis de ambiente.")
        sys.exit(1)
    try:
        app = web.Application(client_max_size=42 * 1024 * 1024)
        app.router.add_get("/", _pagina_inicial)
        app.router.add_get("/style.css", _estilo_site)
        app.router.add_get("/eden-ui.css", _elden_ui_css)
        app.router.add_get("/efeitos-visuais.js", _efeitos_visuais_js)
        app.router.add_get("/narabot-visual-v59.css", _narabot_visual_css)
        app.router.add_get("/app.js", _script_site)
        app.router.add_get("/api/status", _status_api)

        assets_dir = Path("site/assets")
        if assets_dir.is_dir():
            app.router.add_static("/assets/", str(assets_dir), show_index=False)

        # Inicia o servidor web em background (task async) sem bloquear o bot.run()
        loop = asyncio.get_event_loop()
        loop.create_task(_run_web_server(app, _os.getenv("PORT", "8080")))
        log.info("Servidor web iniciado em segundo plano na porta %s", _os.getenv("PORT", "8080"))

        # Conecta o Discord (bloqueante)
        bot.run(token)
    except Exception:
        log.exception("Falha ao iniciar NARABOT")
        raise