"""Regras do Ateliê de Cartas do Coliseu.

Gera prompts com direção artística híbrida: dark fantasy monumental e pictórico
com energia, silhuetas e efeitos de anime épico. A moldura oficial é aplicada
separadamente pelo renderizador do NARABOT.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Any

from PIL import Image, ImageOps, UnidentifiedImageError

ARTE_LARGURA = 1234
ARTE_ALTURA = 1000
TAMANHO_MAXIMO_UPLOAD = 8 * 1024 * 1024
PIXELS_MAXIMOS = 18_000_000

DIRECAO_ARTE = """
NARABOT COLISEUM — HYBRID MYTHIC DARK FANTASY / EPIC ANIME ART DIRECTION

CORE IDENTITY
Create premium collectible-card key art that combines the monumental, tragic,
ancient dark-fantasy atmosphere of modern mythic action RPG worlds with the
expressive energy and visual clarity of high-end epic anime illustration.
The result must feel like one coherent NARABOT art universe: painterly and
material-rich environments, mythic scale, solemn atmosphere, but characters
with elegant readable silhouettes, expressive poses, decisive gesture lines,
and spectacular controlled supernatural effects. This is an original visual
identity, not a replica of any specific game's artwork, artist, anime, or IP.

PAINTING AND CHARACTER RENDERING
Use a deliberate 50/50 visual fusion of premium cinematic realism and mature
high-end anime illustration. Characters must have expressive anime-inspired
design language, striking readable eyes and faces, elegant shape design and
dynamic poses, while anatomy, proportions, skin, hair, armor, cloth, weapons,
stone, metal, glass and other materials receive realistic physically coherent
rendering. The environment should feel like a photorealistic dark-fantasy
film still, while the subject retains the visual impact and controlled
stylization of top-tier seinen / action-fantasy anime key art. Use finely
resolved micro-textures, crisp focal detail, nuanced gradients, natural
surface imperfections and believable material response. Target 4K-level
perceived detail and professional ultra-high-definition finish: clean edges,
well-defined forms, intricate but readable details, no pixelation, no blur,
no compression artifacts. Avoid flat cel shading, plastic CGI, chibi
proportions, generic mobile-game art, over-smoothed faces, waxy skin,
excessive outlines, muddy over-texturing and noisy detail. Stylized anatomy
must remain convincing and physically plausible.

WORLD, SCALE AND STORY
Build a layered mythic world: colossal ruined citadels, eroded temples,
cathedral arches, ancient bridges, petrified forests, vast battlefields,
forgotten thrones, shattered moons, underground sanctuaries, storm-wracked
cliffs or other environments chosen to fit the actual card concept. Add small
scale cues (distant towers, banners, birds, tiny figures, broken architecture)
when they reinforce scale. The image must communicate a specific event,
conflict, discovery or emotional beat—not merely a character standing in fog.
Use foreground, subject plane and distant background for cinematic depth.

CINEMATIC COMPOSITION
Landscape 5:4 illustration. One dominant focal subject or one clearly legible
story event. Use a deliberate camera angle (low-angle for imposing entities,
three-quarter action angle for combatants, intimate close framing for relics,
wide environmental composition for locations). Dynamic diagonals and flowing
cloth, hair, weapons, debris or energy may guide the eye toward the focal
point. Preserve clean negative space and safe margins around the main subject;
keep all important anatomy, weapon tips and magical forms inside the crop.
Readable at small card size. Avoid clutter, multiple competing focal points,
random floating objects and symmetrical poster poses unless the concept truly
calls for a ceremonial portrait.

LIGHT, COLOR AND ATMOSPHERE
Use dramatic motivated lighting: a clear key light, controlled rim light,
volumetric shafts, atmospheric perspective, selective bloom and deep but
readable shadows. Use a restrained base of charcoal, slate, weathered stone,
aged iron, muted bronze and antique gold. Introduce a deliberate accent palette
that supports the subject and card type; do not cover the entire image in one
monochrome filter. Magic and energy should illuminate nearby surfaces and
interact with smoke, rain, dust, snow, ash, water or debris. Particles must
support motion and scale, not become visual noise.

VISUAL QUALITY BAR
Ultra-premium 4K-quality game cinematic key art fused with mature anime
illustration and photorealistic dark-fantasy rendering. Film-grade composition,
exceptional character design, realistic anatomy and materials, intricate
micro-detail, sharp focal plane, controlled depth of field, nuanced HDR-like
lighting, rich but disciplined color grading, physically believable shadows,
volumetric atmosphere and polished professional finish. The image must look
like a high-budget anime feature film rendered with the material fidelity of
a realistic AAA game cinematic. Preserve clean readability at small card
size. Every card must have a distinct visual hook that can be described in
one sentence. Quality target describes detail and finish; do not add borders
or UI to simulate resolution.

CARD ART ONLY — STRICT OUTPUT RULES
Create only the illustration, not a finished card. Do NOT draw any border,
frame, card edge, title, lettering, numbers, stats, icons, rarity gem, UI,
logo, watermark, signature or text of any kind. Do not reserve a fake frame
inside the image. The NARABOT renderer adds the official fixed rarity frame,
name, stats and ability separately. Keep important content away from the outer
edges so the official frame never covers it.
""".strip()

DIRETRIZES_CATEGORIA = {
    "chefe": (
        "SUBJECT DIRECTION — BOSS: depict one unforgettable boss entity or antagonist. "
        "Give it a unique silhouette, readable anatomy, a signature weapon/body feature, "
        "and a clear action or threatening gesture. Establish scale using architecture, "
        "terrain or a tiny environmental scale cue. Show what makes this foe dangerous; "
        "do not default to a generic armored knight."
    ),
    "arma": (
        "SUBJECT DIRECTION — WEAPON / RELIC: make one complete, unmistakable weapon or relic "
        "the protagonist. Show a strong three-quarter view and distinctive construction, "
        "wear, engravings, balance, material and history. Give it a small environmental "
        "story (embedded in stone, held by a spectral hand, resting on an altar, etc.). "
        "Energy effects must explain its power and must not obscure its silhouette."
    ),
    "magia": (
        "SUBJECT DIRECTION — SPELL / MAGIC: depict a specific supernatural event with a "
        "visible source, direction of movement and physical consequence in the environment. "
        "Use elegant anime-like energy trails and painterly light interaction. Avoid generic "
        "glowing orb, random runes or floating symbols as the entire subject."
    ),
    "covenant": (
        "SUBJECT DIRECTION — COVENANT / ORDER: tell the story of an oath, secret order or "
        "ancient faction through a ritual, confrontation, procession, shrine or group silhouette. "
        "Use one dominant emblematic object or figure and environmental clues to communicate "
        "the faction's values. Do not make it look like a flat logo or UI badge."
    ),
    "jogo": (
        "SUBJECT DIRECTION — GAME MILESTONE: depict a memorable original scene that expresses "
        "the emotional identity of the source game's journey. Choose a concrete visual moment: "
        "a final ascent, a quiet aftermath, a dangerous crossing, a discovery, a victory with "
        "a cost, or a world-changing event. Avoid a generic hero portrait."
    ),
    "patente": (
        "SUBJECT DIRECTION — RANK / ACHIEVEMENT: create a physical ceremonial relic, insignia, "
        "weapon, mantle or symbolic scene that communicates earned mastery. It must feel like "
        "an object from the NARABOT world, not a digital badge, trophy icon or interface element."
    ),
    "especial": (
        "SUBJECT DIRECTION — TACTICAL SPECIAL: depict the exact battlefield effect described by the card, with a visible source, affected area and physical consequence. Show the scope accurately (one row, all rows, siege line, allied formation or a specific target). Do not turn the effect into a generic spellcaster portrait or depict game UI."
    ),
    "patente": (
        "SUBJECT DIRECTION — RANK / PROGRESSION: depict an earned member of the Order at the exact career stage named by the card. Clothing, armor, equipment and scale must look appropriate to the rank; the scene should communicate earned discipline rather than a random champion."
    ),
    "relíquia": (
        "SUBJECT DIRECTION — PRIMORDIAL RELIC: portray an ancient object or entity that seems "
        "to predate the known world. Make its impossible age and power legible through scale, "
        "material, environmental reaction and restrained cosmic phenomena. Avoid generic galaxy "
        "backgrounds or a simple glowing crystal."
    ),
}

CORES_TIPO = {
    "Destreza": "cool spectral teal, moonlit silver and restrained cyan edge-light; agile flowing motion",
    "Força": "ember red, oxidized copper, furnace orange and heavy kinetic impact",
    "Magia": "muted violet, deep indigo, pale arcane white and elegant supernatural trails",
}

DIRETRIZES_RARIDADE = {
    "Comum": "RARITY INTENSITY — COMMON: grounded and intimate scale; one strong visual idea, restrained supernatural effects, believable worn materials and focused composition. Keep the same premium rendering quality; do not make it look unfinished or low-resolution.",
    "Rara": "RARITY INTENSITY — RARE: add a distinctive supernatural accent, unusual environmental detail or more dynamic action beat. The image should feel exceptional but still grounded in the world.",
    "Épica": "RARITY INTENSITY — EPIC: allow a more ambitious camera angle, layered magic, dramatic environmental reaction and a larger sense of scale. Keep one clear focal point and avoid visual clutter.",
    "Lendária": "RARITY INTENSITY — LEGENDARY: create a monumental, iconic moment with highly distinctive silhouette, elaborate environment, powerful controlled effects and memorable cinematic lighting. The subject should feel historically significant.",
    "Primordial": "RARITY INTENSITY — PRIMORDIAL: depict mythic, world-altering scale and an uncanny sense of ancient divinity. Use impossible architecture or cosmic/environmental distortion sparingly but powerfully. Preserve a readable central subject; grandeur must not become chaos.",
}

HABILIDADE_VISUAL = {
    "primeira_luz": "Visual motif for Primeira Luz: a decisive first ray of dawn cutting through darkness, illuminating the subject's leading edge.",
    "retaliacao": "Visual motif for Retaliação: a counterattack at the instant of reversal, with a sharp returning arc and displaced debris.",
    "impeto": "Visual motif for Ímpeto: forward momentum, streaming cloth and energy, with the environment pushed back by the charge.",
    "ultimo_folego": "Visual motif for Último Fôlego: a wounded but unbroken subject releasing one final concentrated burst of force; avoid gore.",
    "contragolpe": "Visual motif for Contragolpe: a precise strike slipping through a larger opponent's guard, emphasizing timing and agility.",
    "encadeamento": "Visual motif for Encadeamento: successive linked arcs or repeated motion echoes that form one elegant continuous attack path.",
    "adaptacao": "Visual motif for Adaptação: a transformation between two combat approaches, shown through contrasting motion or materials without splitting the image into panels.",
    "sangue_frio": "Visual motif for Sangue-frio: absolute composure amid chaos, with suspended particles and a calm, precise focal pose.",
    "instinto": "Visual motif for Instinto: a near-instinctive evasive or predatory movement, with a sharp gaze and subtle motion cues.",
    "precisao": "Visual motif for Precisão: one exact impact point, clean trajectory and carefully controlled energy; no random explosions.",
    "drenagem": "Visual motif for Drenagem: energy being drawn away through tendrils, fading light or flowing particles; keep the effect elegant and legible.",
    "cacador_arcano": "Visual motif for Caçador Arcano: a focused hunter confronting supernatural energy, with a precise countermeasure or ward.",
    "quebra_ritmo": "Visual motif for Quebra-ritmo: a sudden interruption of an opponent's motion, expressed by a broken energy trail or shattered rhythm in the environment.",
    "lei_primeva": "Visual motif for Lei Primeva: the first law of creation manifesting as ancient geometric light and primordial force.",
    "decreto_soberano": "Visual motif for Decreto Soberano: an imposing royal gesture or relic imposing order over a hostile force; regal, not ornamental UI.",
    "olho_tempestade": "Visual motif for Olho da Tempestade: a calm focal center surrounded by a vast spiraling storm, with controlled directional energy.",
    "fome_abismo": "Visual motif for Fome do Abismo: a deep void-like force pulling light and debris inward, with the subject still clearly visible.",
    "paradoxo_eterno": "Visual motif for Paradoxo Eterno: a visual contradiction of time, such as suspended fragments, repeated silhouettes or a fractured light path; no clocks or text.",
}

# Briefings narrativos por ID: detalhes visuais exclusivos, derivados do cânone
# do catálogo. Não são fatos novos de lore; são interpretações visuais controladas.
CENAS_POR_CARTA = {
    "chefe_guardiao_cinzas": "A towering ash sentinel in scorched, layered plate armor stands at the threshold of a burned fortress. A fractured furnace-heart glows through cracks in the breastplate; ash streams from the helmet slit as the guardian interrupts an advancing strike with a heavy iron weapon. The instant is a defensive counter, not a generic victory pose.",
    "chefe_dama_vazio": "A regal, otherworldly woman in a severe black veil and weathered ceremonial gown emerges from a collapsed sanctuary. The space around one raised hand folds inward into a silent void; torn banners and dust hang motionless while a faint human silhouette remains visible behind her. Keep her face and silhouette readable, with restrained supernatural horror rather than tentacles or gore.",
    "chefe_cervo_sombrio": "A colossal stag-like forest predator with dark bark-textured hide, branching antlers and pale watchful eyes bursts from a moonlit thicket. Its forelegs are braced for a sudden counter-charge; snapped branches and disturbed leaves show the direction of movement. It must read as an animalistic boss, not a humanoid knight wearing antlers.",
    "chefe_rei_afogado": "An ancient drowned king in corroded royal armor rises from a flooded throne hall. Seaweed, barnacles and wet cloth cling to the armor; one hand lifts a battered crown while cold daylight breaks through the water-filled ceiling. Show the moment of return from the depths, with water displacement and a clear imposing silhouette.",
    "chefe_oraculo_ruina": "A blindfolded or veiled oracle stands on a broken observatory dais above a ruined city, reading a collapsing constellation through a suspended astrolabe. Violet-white trajectories converge toward one decisive point above the open palm, suggesting a prediction becoming an advancing force. Avoid generic wizard robes and random floating runes.",
    "chefe_cacador_sem_rosto": "A lean faceless hunter in layered travel leathers and a weather-stained hood tracks an unseen target through a narrow mist pass. The smooth mask has no features; a narrow curved blade and taut hunting line form a precise ambush composition. Teal edge light catches the weapon while the body remains partly concealed by terrain.",
    "chefe_vigia_cinzento": "A massive watchman in battered grey iron stands on a rain-dark fortress wall, holding a broad shield scarred by repeated impacts. Dark hostile energy drains from the shield into the wet stone beneath his boots, leaving the metal dim but intact. Emphasize endurance, weight and a grounded defensive stance.",
    "chefe_aparicao_veio": "A translucent wanderer slips between two ruined standing stones in a fogbound mountain pass. Its silhouette alternates between a cloaked human outline and drifting veil-like strands; one foot is already fading while the other changes direction. Use restrained spectral teal and layered mist, with no generic skull or ghost-sheet design.",
    "arma_lamina_peregrino": "A single travel-worn dueling sword lies diagonally across a pilgrim's stone marker, its narrow blade nicked from use and its simple grip wrapped in faded cloth. The first dawn ray touches only the sharpened edge; a distant empty road gives the weapon a history of long journeys. The sword itself is the unmistakable protagonist.",
    "arma_martelo_fornalha": "A heavy blacksmith's war hammer rests in the hands of an armored forge veteran inside a working mountain foundry. Its broad head is layered from dark iron and copper bands, with ember seams and visible hammer marks; sparks trace a repeated, linked rhythm around the anvil. Show the tool's weight and craftsmanship, not a generic glowing fantasy hammer.",
    "arma_cajado_marulho": "An aged tide-oracle staff rises from a shallow stone pool in a submerged archive. Its shaft is carved from dark driftwood, bound with tarnished silver and a suspended sea-glass focus; concentric ripples bend reflected starlight toward the tip. The magic should feel tidal and measured, not like a fireball.",
    "arma_duas_luas": "A poised dancer-warrior turns between two crescent blades whose polished edges form a precise intersecting arc. Her layered dark fabric follows the rotation; two pale moon reflections mark the exact points of the blades. Frame the instant before a clean, controlled strike, with full weapon silhouettes visible.",
    "arma_grande_sino": "A colossal iron bell hangs from a ruined fortress belfry, guarded by a broad sentinel. Its surface is pitted, riveted and dark with age; a single shockwave ripples dust and loose chains outward as the bell begins to sound. Make the bell and its physical vibration the focal subject, not a decorative church scene.",
    "arma_agulha_astro": "A slender astral needle, part precision instrument and part arcane weapon, floats above a dark observatory worktable. Its fine silver point aligns with a tiny star-like aperture while violet filaments stitch a measured constellation through the air. Emphasize delicate engineering, exact alignment and fragile luminous detail.",
    "arma_lanca_fornalha": "A disciplined iron lancer advances through furnace smoke with a long, practical spear held low and forward. The spearhead is forged from dark steel with a narrow ember seam; the soldier's layered armor bears heat discoloration and field repairs. Use a strong forward diagonal and readable spear length.",
    "arma_arco_peregrino": "A solitary road scout draws a compact recurved bow from a high ridge above a winding pass. The arrow is aligned with a distant signal lantern; wind pulls the scout's weathered cloak backward and the bowstring is visibly taut. Keep the shot precise and quiet, with a clear line from archer to target.",
    "magia_brasa_errante": "A young itinerant pyromancer shelters one small living ember between gloved hands in a dark roadside shrine. The ember bends sideways in a cold draft but does not go out, casting warm light across soot, copper charms and a focused expression. Keep the flame compact and controlled, not an explosion.",
    "magia_selo_vigilia": "A vigilant guardian kneels before a weathered stone seal at the entrance to a watchtower. One hand adapts the seal's interlocking bands while the other holds back a shifting shadow; the scene shows a protective mechanism changing configuration under pressure. Use cool silver and teal accents, with clear hand-object interaction.",
    "magia_trovao_oco": "A battle evoker in heavy iron gear channels a column of hollow thunder through a cracked siege tower. The lightning travels through suspended metal rings and drains the glow from enemy weapons; the caster braces against the recoil. Show energy being redirected and absorbed, not a random lightning bolt in the sky.",
    "magia_nevoa_antiga": "An elderly mist oracle stands on a drowned causeway where pale fog moves in deliberate braided streams around ancient pillars. Two spectral currents connect in sequence above the water, revealing a hidden route through the ruins. The figure remains the anchor; avoid an indistinct cloud filling the whole image.",
    "magia_sol_negro": "A solemn herald raises a dark solar disc above a ruined amphitheater as the surrounding light bends toward it. A thin corona of pale violet and ember light interrupts the scene's rhythm; banners and airborne ash are pulled off course. Make the eclipse-like object and the herald's gesture legible, without turning the image into a generic galaxy.",
    "magia_fagulha": "A young acolyte in practical travel robes catches a single hostile arcane spark with a small engraved ward held close to the chest. The spark splits into a clean counter-trajectory, illuminating the acolyte's concentrated face and the worn stone corridor. Intimate scale, clear source and direction of energy.",
    "magia_orbe_eco": "A robed guardian studies a dark glass orb suspended above an old stone plinth. Inside the orb, one precise ring of light repeats outward like a sound echo; the guardian's fingertips align with the ring without touching it. Use a restrained violet-white palette and crisp circular geometry, not a generic glowing ball.",
    "magia_chama_fria": "A composed sorceress in layered charcoal-blue garments holds a narrow flame that burns with pale blue-white fire and gives off frost-like vapor. Nearby rain droplets freeze in midair while her expression remains calm. Show the contradiction of heat and cold through material reaction, not through two separate panels.",
    "covenant_lobos_cinza": "A compact pack of ash-grey wolves moves in coordinated formation across a burned pine ridge. The lead wolf watches forward while the others protect its flanks; soot, scars and ember-lit eyes distinguish them from ordinary animals. The composition should communicate instinctive group defense, not a single oversized wolf portrait.",
    "covenant_lua_velada": "A veiled moon-walker crosses a narrow bridge beneath a clouded moon, carrying a curved blade low and a small lantern screened by cloth. A first pale ray reveals the safe stepping stones while the rest of the bridge disappears into mist. Show a quiet, agile advance and the relationship between light and concealment.",
    "covenant_sentinelas": "Three disciplined sentinels of the Veil hold separate watch positions among broken archways in a mountain pass. Their weathered cloaks and narrow teal ward-lights form a connected defensive pattern; each watches a different approach. Keep the group readable as coordinated guardians, not a crowd of anonymous soldiers.",
    "covenant_coroa_abismo": "A crown of dark iron and bone-like mineral rests above a deep fissure, drawing thin strands of light from the surrounding stone. A sworn guardian reaches toward it as loose fragments descend into the abyss. The crown is the focal relic; communicate draining gravity and danger without gore or a generic black hole.",
    "covenant_ultimos": "A small band of exhausted oath-bound wanderers holds a narrow mountain pass at the last light of day. Their torn cloaks and damaged weapons show the cost of the journey; one figure remains standing at the front while the others brace behind. Convey a final collective effort without depicting graphic injury.",
    "covenant_filhos_brasa": "Two young forge-born fighters meet an advancing opponent in a smoke-filled foundry yard. One draws the enemy's guard while the second delivers a timed counter from the side; their ember-marked gear and shared movement make the coordination clear. Avoid a generic army charge.",
    "covenant_peregrinos_nevoa": "A line of hooded pilgrims follows a narrow trail through a high pass filled with layered morning mist. The lead traveler carries a small lantern whose first light reveals the next bend; footprints and wind-shaped cloth establish forward movement. The scene is about passage and guidance, not a battle.",
    "covenant_irmandade_ferro": "A sworn iron brotherhood locks shields in a compact formation inside a breached gatehouse. The front rank absorbs an incoming impact while a second rank prepares to answer; scratched heraldic plates and repaired straps show long service. Emphasize discipline and mutual protection.",
    "gwent_especial_nevoa": "A battlefield seen across one clearly defined combat lane as dense grey mist rolls low and swallows the silhouettes of troops. The far end of that single lane disappears first; the neighboring lanes remain faintly visible, making the tactical area effect immediately understandable. No text, symbols or interface elements.",
    "gwent_especial_geada": "A wide battlefield freezes simultaneously across all three visible lanes: shields frost over, banners stiffen and breath clouds hang in the air. A descending curtain of pale ice crosses the entire scene, communicating a field-wide weather effect without obscuring the soldiers.",
    "gwent_especial_chuva": "Iron rain strikes only the distant siege line: heavy metallic droplets and fragments hammer trebuchets, barricades and siege crews while the nearer infantry lanes remain comparatively clear. Use a diagonal storm curtain and visible impacts to communicate a targeted siege-lane penalty.",
    "gwent_especial_chifre": "A battle horn made from dark bronze and carved bone is sounded by a standard-bearer at the center of an allied formation. Visible pressure waves pass through nearby soldiers as they raise shields and weapons together; the sound's effect is shown through synchronized posture, not written notes or glowing UI rings.",
    "gwent_especial_medico": "A field medic in a weathered leather apron retrieves a wounded but living soldier's dropped insignia and calls them back toward the formation from a triage station. Bandages, supply satchels and a discarded shield tell the story of recovery and return; no gore or graphic wounds.",
    "gwent_especial_queima": "At the instant of a decisive battlefield purge, the two most imposing combatants on opposing sides are engulfed by a controlled vertical surge of white-hot light, while lesser soldiers recoil. Keep both focal figures visible and make the symmetrical removal of the strongest threats clear without depicting gore.",
    "gwent_especial_purificar": "A ritualist stands between three weather-beaten battle lanes as storm clouds, frost and rain dissolve into clear air. The cleansing wave travels horizontally across the full battlefield, lifting dark weather from banners and armor. Show environmental change rather than a generic magic explosion.",
    "gwent_especial_execucao": "A masked executioner isolates the weakest, visibly exhausted enemy in one combat lane and brings a heavy blade down in a controlled, non-graphic finishing strike. Stronger silhouettes remain distant and out of focus; the chosen target is clearly the vulnerable one. No blood or gore.",
    "gwent_especial_vinculo": "Two allied warriors stand shoulder to shoulder inside a marked defensive lane, forearms clasped over a shared oath-knot of red cord and iron rings. Their combined shields form one continuous barrier as hostile force strikes it. The image must make the minimum pair and mutual reinforcement obvious.",
    "gwent_especial_batedor": "A lone scout of the Veil slips from a concealed reserve passage carrying a sealed dispatch case. The scout reaches toward a stack of waiting field maps and supply tokens, suggesting a new tactical option entering the hand. Teal mist, light gear and a clear forward route; no cards or game UI in the image.",
    "gwent_especial_muralha": "A monumental ancestral wall of interlocked iron shields and weathered stone rises behind an allied line. Its old reliefs catch a narrow gold light as soldiers take position beneath it; the wall visibly strengthens the formation. Show a physical defensive structure, not a flat emblem.",
    "gwent_unidade_baluarte": "A broad-shouldered forge defender in layered furnace-black plate anchors the center of a tightly packed allied line. Three distinct allied silhouettes brace behind his shield; the more they close ranks, the more immovable he appears. Ember seams illuminate dents and repair rivets.",
    "gwent_unidade_lamina_sem_juramento": "A solitary, lightly armored blade fighter stands apart from every other combatant on a rain-dark stone causeway. A long unadorned sword is held in a low dueling guard; the empty space around the fighter is deliberate and intimidating. One precise attack line, no supporting soldiers.",
    "gwent_unidade_portaestandarte": "A sturdy standard-bearer plants a tall iron banner among allied infantry. The banner's weathered cloth catches a furnace-orange updraft and the soldiers around it straighten their formation. The standard must be a physical, readable object and the central source of cohesion.",
    "gwent_unidade_oraculo_clima": "A weather oracle in layered indigo robes studies the meeting point of rain and sleet above a high stone observatory. One hand traces a calm pocket in the storm while ice and rain slide harmlessly around the figure. Emphasize climate resistance and composed observation.",
    "gwent_unidade_eco": "An arcane herald stands in a chamber lined with spent spell vessels and extinguished sigils. Residual light from several used relics converges into a single measured echo around the herald's staff. Make the accumulated magical residue visible as repeated translucent arcs, not readable runes or UI symbols.",
    "gwent_unidade_cavaleira": "A disciplined knight of the broken Veil pivots at the exact moment an opponent commits to a predictable strike. Her split cloak and asymmetrical armor reveal a quick change of direction; the enemy's weapon passes through empty space. Show tactical timing and agility, not brute force.",
    "gwent_unidade_gigante": "An immense ancient gate giant fills the entrance of a cyclopean fortress, one hand braced against the stone lintel and the other gripping a battered gate-chain. Tiny allied figures at its feet establish scale. Its posture is alert and ready to advance, not a static monster portrait.",
    "gwent_unidade_cartografa": "A practical coastal cartographer in a weatherproof cloak kneels over a hand-drawn chart on a cliff above a dangerous tidal channel. She marks a narrow safe route with a brass divider while waves expose hidden stepping stones below. Show navigation as an active discovery, not a generic scholar portrait.",
    "gwent_unidade_invocador": "A battle invoker in dark ceremonial armor opens a controlled solar-black aperture above a ruined observatory floor. A hostile arcane shape approaches from one side while the invoker directs a narrow counter-current toward it. Keep the caster, aperture and target in one clear visual chain.",
    "gwent_unidade_mestre_forja": "A veteran master smith in heavy forge armor stands beside a second allied fighter at a glowing anvil in a fortress foundry. Their weapons meet briefly above the anvil, sharing a single ember-lit arc that signals coordinated strength. Show two distinct allies and their physical cooperation.",
    "gwent_unidade_dupla_veu": "Two near-identical Veil sisters occupy separate elevations of a ruined pass, coordinating a crossing attack through a narrow opening. Their cloaks share a subtle pattern but their stances differ; one distracts while the other advances from the opposite route. Make the spatial separation and coordination legible.",
    "gwent_unidade_circulo": "An arcane adept stands inside a weathered circular chamber where one allied mage and a spent spell vessel feed a measured ring of violet light. The ring strengthens around the adept's hands, linking allies and stored magic. Keep geometry architectural and physical, not a floating interface diagram.",
    "gwent_mitica_coroa": "The heir to a veiled crown stands before a vast ceremonial gate, wearing restrained royal armor and a dark mantle threaded with antique gold. Behind the heir, allied standards align into a single imposing formation; the crown is ancient and weighty, not jeweled excess. Mythic presence without divine wings or generic cosmic scenery.",
    "gwent_singular_primeiro": "A lone oathkeeper stands at the first stone threshold of the Coliseum, carrying no visible army or entourage. A single weathered blade and a plain oath-band are the only regalia; the empty road behind and the first light ahead express a singular achievement earned alone.",
    "gwent_singular_intocavel": "A precise duelist stands untouched in the center of a shattered arena while every incoming blade has missed and remains embedded in the surrounding stone. The fighter's clothing and armor are clean but not pristine; a single narrow weapon line points toward the last opponent. No blood, no victory trophy.",
    "gwent_singular_nivel1": "A determined novice warrior stands at the foot of an enormous trial staircase, visibly small against the architecture yet unshaken. The first step bears fresh impact marks from a hard-won ascent; simple equipment and an unwavering stance communicate victory under severe constraint.",
    "gwent_singular_cacador_chefes": "A solitary hunter stands among the fallen weapons and broken insignia of several defeated bosses, each trophy represented by a distinct damaged object rather than severed bodies. The hunter's cloak is worn and the final crown-like relic rests at the center foreground. Convey completion through evidence of many trials.",
    "primordial_origem": "An immense, faceless primordial presence takes shape at the first moment of creation inside a dark stone void. Fragments of raw matter, water and ember gather around a central silhouette as the first geometric law stabilizes the scene. The entity must remain identifiable; avoid a generic galaxy or humanoid deity with random ornaments.",
    "primordial_trono": "The sovereign of the first throne sits within an impossible basalt hall whose columns align into a strict, unbroken order. One raised hand stills opposing banners and fractures the momentum of an approaching force. Heavy iron regalia, a severe crown and controlled ember light communicate authority rather than luxury.",
    "primordial_tempestade": "A swift herald stands in the calm eye of a vast rotating storm above a broken coastal citadel. Cloak and hair move in opposing wind currents while a narrow path remains perfectly still around the figure. Use teal lightning and silver rain to communicate command of the storm without hiding the subject.",
    "primordial_abismo": "An ancient entity emerges from a dreamlike abyss where stone, dust and pale light are drawn inward toward its silhouette. The figure grows more defined as the surrounding battlefield loses brightness; keep its anatomy and gaze readable. Avoid tentacle clichés and an empty black-hole composition.",
    "primordial_eternidade": "A guardian stands between two versions of the same shattered fortress moment: fragments are suspended in one direction while their shadows fall in another. A broken circular path of light bends back toward the guardian's raised weapon, suggesting a final reversal of time. No clocks, text or split-panel layout.",
}

HABILIDADE_TEXTO_VISUAL = {
    "guardiao_fileira": "Ability rule: gains strength for each allied unit in the same row, up to three. Visualize a defensive line becoming denser around the guardian; do not add numeric marks.",
    "cacador_solitario": "Ability rule: stronger when no allied unit shares the row. Preserve deliberate isolation and a wide empty tactical space around the hunter.",
    "estandarte": "Ability rule: strengthens other allied units in the same row. Show nearby allies physically rallying around one standard; do not use glowing UI arrows.",
    "resistencia_climatica": "Ability rule: ignores up to two points of weather penalty. Show rain, frost or storm visibly failing to hinder the subject while still affecting the environment.",
    "eco_arcano": "Ability rule: gains strength from a special card already spent. Visualize stored residual magic being recalled from spent relics, not a random spell blast.",
    "dupla_fornalha": "Ability rule: gains strength when another Force unit shares the row. Show two forge-aligned allies coordinating in the same formation.",
    "irmandade_veu": "Ability rule: gains strength when a Dexterity ally occupies another row. Show two allied Veil fighters coordinating across distinct elevations or lanes.",
    "circulo_arcano": "Ability rule: gains strength from an allied Mage in the same row or a special card in the discard. Show a visible arcane link between an ally and residual magic.",
    "gwent_nevoa": "Effect: reduces all units in one chosen row. The mist must be restricted to exactly one visible lane.",
    "gwent_geada": "Effect: reduces units in all three rows. Show frost affecting all three visible lanes evenly.",
    "gwent_chuva": "Effect: reduces siege units only. Direct the iron rain exclusively at siege engines and their crew.",
    "gwent_chifre": "Effect: strengthens allied units in one chosen row. Show a horn call rallying one allied lane, not the entire battlefield.",
    "gwent_medico": "Effect: returns a low-power unit from discard to hand. Depict field recovery and a soldier rejoining the reserve; do not show cards or UI.",
    "gwent_queima": "Effect: removes the strongest unit on each side. Keep one dominant threat on each opposing side as the two clear targets; avoid graphic destruction.",
    "gwent_purificar": "Effect: removes weather effects from all three rows. Clear rain, frost and fog across all visible lanes.",
    "gwent_execucao": "Effect: removes the weakest enemy in the chosen row. Make one vulnerable enemy in one lane the clear target; keep the action non-graphic.",
    "gwent_vinculo": "Effect: strengthens an allied row if at least two units are present. Show at least two allies linked in the same lane.",
    "gwent_batedor": "Effect: draws a reserve card if available. Depict a scout retrieving a new tactical dispatch from reserve; never draw an actual card UI.",
    "gwent_muralha": "Effect: strengthens allied units in one chosen row. Show a physical defensive wall supporting one allied lane.",
}

class ArteInvalida(ValueError):
    """Imagem não atende aos requisitos do Ateliê."""


@dataclass(frozen=True)
class ImagemNormalizada:
    dados: bytes
    largura: int
    altura: int
    formato: str = "JPEG"


def _valor_prompt(valor: Any, limite: int) -> str:
    texto = " ".join(str(valor or "").split())
    texto = "".join(ch for ch in texto if ch.isprintable())
    return texto.replace("<", "(").replace(">", ")").replace("`", "'")[:limite]


def gerar_prompt_carta(carta: dict[str, Any]) -> str:
    """Gera briefing individual a partir do catálogo canônico do Coliseu."""
    from sistemas.cartas import HABILIDADES

    card_id = _valor_prompt(carta.get("id") or carta.get("card_id") or "", 120)
    nome = _valor_prompt(carta.get("nome") or "Carta do Coliseu", 100)
    categoria_raw = _valor_prompt(carta.get("categoria") or "Carta", 60)
    categoria = categoria_raw.casefold()
    habilidade_id = _valor_prompt(carta.get("habilidade") or "", 60).casefold()
    raridade = _valor_prompt(carta.get("raridade") or "Rara", 30)
    tipo = _valor_prompt(carta.get("tipo") or "", 30)
    faccao = _valor_prompt(carta.get("faccao") or "Ordem de Ferro", 60)
    fileira = _valor_prompt(carta.get("fileira") or "melee", 30)
    descricao = _valor_prompt(carta.get("descricao") or "", 500)

    habilidade = HABILIDADES.get(habilidade_id, {})
    habilidade_nome = _valor_prompt(habilidade.get("nome") or habilidade_id or "Sem habilidade", 80)
    habilidade_regra = _valor_prompt(habilidade.get("texto") or "", 240)
    cena = CENAS_POR_CARTA.get(card_id, "")
    if not cena and card_id.startswith("patente_"):
        nivel = "unrecorded"
        import re
        match_nivel = re.search(r"nível\s+(\d+)", descricao, flags=re.IGNORECASE)
        if match_nivel:
            nivel = match_nivel.group(1)
        estagio = {
            "Recruta da Ordem": "newly sworn recruit in practical, lightly worn training armor, carrying a basic service weapon; posture attentive and still learning discipline",
            "Escudeiro da Ordem": "field-proven squire with repaired medium armor, a maintained shield and a visible service token; stance shows growing confidence and responsibility",
            "Veterano da Ordem": "seasoned veteran in layered, scarred iron armor, with a personalized weapon and evidence of campaigns; posture controlled and experienced",
            "Marechal da Ordem": "senior marshal in distinguished but functional command armor, an aged mantle and a field standard; authority comes from command presence, not excessive jewels",
        }.get(nome, "ranked member of the Order with equipment proportionate to their earned service")
        cena = (
            f"Depict {estagio}. The card represents Gwent progression milestone level {nivel}; communicate advancement through a believable ceremonial or field moment, "
            "with a fortress training ground or mustering courtyard in the background. Use the card's faction, type and ability for the accent colors and action. "
            "Do not add medals, titles, numeric inscriptions or heraldry that is not part of the NARABOT setting."
        )
    elif not cena and card_id.startswith("jogo_"):
        marco = "platinum mastery" if card_id.endswith("_platina") else "completed journey"
        papel = {
            "Força": "a durable frontline champion in practical iron armor, holding a heavy but credible melee weapon",
            "Destreza": "an agile pathfinder or duelist in layered travel gear, using a precise ranged or curved weapon",
            "Magia": "an arcane specialist with functional robes, a crafted focus and controlled supernatural energy",
        }.get(tipo, "an elite Gwent combatant with a clear tactical role")
        cena = (
            f"Create an original NARABOT Gwent elite earned for {marco}. Depict {papel}. The title '{nome}' is the canonical identity cue; "
            f"the card description is '{descricao}'. Show one memorable trial-aftermath or earned-mastery moment in the Coliseum world, "
            "without depicting any scene, character, costume, creature, weapon design or location from the external game that inspired the reward. "
            "Keep the scene original and let the card's actual faction and ability determine the visual motif."
        )

    diretriz = next(
        (texto for chave, texto in DIRETRIZES_CATEGORIA.items() if chave in categoria),
        "SUBJECT DIRECTION: depict one concrete subject or story event that follows the card's canonical name, description and ability. Do not invent a new character identity or unrelated lore.",
    )
    cor = CORES_TIPO.get(tipo, "charcoal, antique silver and restrained arcane light")
    raridade_prompt = DIRETRIZES_RARIDADE.get(raridade, DIRETRIZES_RARIDADE["Rara"])
    habilidade_prompt = HABILIDADE_VISUAL.get(habilidade_id, "")

    diretrizes_faccao = {
        "Ordem de Ferro": "FACTION IDENTITY: disciplined iron-clad soldiers, fortress heraldry, forged steel, ember-orange accents, military formations and grounded martial realism. Use practical armor construction, repaired straps, rivets and credible weight.",
        "Errantes do Véu": "FACTION IDENTITY: agile wanderers, veiled scouts, wind-worn cloaks, teal spectral light, curved blades, misty passes and motion. Favor layered travel garments, asymmetrical silhouettes and environmental concealment.",
        "Conclave Arcano": "FACTION IDENTITY: arcane scholars and battle-mages, runic geometry, violet astral light, ancient observatories and controlled magic. Favor functional scholar-warrior clothing, crafted instruments and physically coherent magical effects.",
    }
    origem = (
        "CANON AND SOURCE POLICY: use the NARABOT card catalog as the authoritative source for card identity, category, faction, row, type, rarity, ability and description. "
        "The card-specific scene below is an art-direction interpretation, not permission to alter canon. Do not invent names, backstory, powers, factions, symbols or relationships that are not present in the supplied card data. "
        "Original NARABOT Gwent universe only: do not depict or name external video games, franchises, copyrighted characters, logos, costumes or locations."
    )
    fileiras = {
        "melee": "TACTICAL ROLE: close-combat frontline. If the card is a unit, show credible proximity, a readable melee weapon or defensive stance, and physical interaction with the immediate battlefield.",
        "ranged": "TACTICAL ROLE: ranged specialist. If the card is a unit, show a clear line of sight, a bow, crossbow, throwing weapon or precision tool, and a believable firing position.",
        "siege": "TACTICAL ROLE: siege or arcane artillery. If the card is a unit, show range, machinery, a crafted focus or controlled long-distance spellcasting; establish distance and scale.",
    }
    diretriz_fileira = fileiras.get(fileira, "TACTICAL ROLE: follow the card's actual special-effect description; do not force a humanoid combat pose onto a spell, relic or battlefield effect.")

    contexto = (
        f'CARD ID: {card_id or "not supplied"}.\nCARD NAME: "{nome}".\nCATEGORY: {categoria_raw}.\n'
        f'FACTION: {faccao}.\nTACTICAL ROW: {fileira}.\nTYPE: {tipo or "unassigned"}.\nRARITY: {raridade}.\n'
        f'ABILITY: {habilidade_nome}.\nCANONICAL ABILITY RULE: {habilidade_regra or "No ability rule supplied."}'
    )
    if descricao:
        contexto += f'\nCANONICAL CARD DESCRIPTION: "{descricao}".'

    blocos = [
        DIRECAO_ARTE,
        origem,
        "CANONICAL CARD BRIEFING\n" + contexto,
        "CARD-SPECIFIC VISUAL SCENE\n" + (cena or (
            "No fixed scene exists for this generated card ID. Build one original, specific scene strictly from the canonical card name, description, ability rule, faction and type. "
            "First identify the literal subject implied by the name; then show one concrete action or event that expresses the description. "
            "Do not substitute a generic warrior portrait. If the description is too sparse, depict the named object or role in a plausible setting and keep unknown details visually neutral."
        )),
        diretrizes_faccao.get(faccao, diretrizes_faccao["Ordem de Ferro"]),
        diretriz_fileira,
        diretriz,
        raridade_prompt,
    ]
    if habilidade_prompt:
        blocos.append(f"ABILITY VISUAL STORYTELLING: {habilidade_prompt} This is a visual metaphor only; do not add text or symbols that resemble UI.")
    if habilidade_id in HABILIDADE_TEXTO_VISUAL:
        blocos.append("ABILITY MECHANICS — VISUAL ACCURACY: " + HABILIDADE_TEXTO_VISUAL[habilidade_id])
    blocos.append(
        f"TYPE COLOR / MOTION LANGUAGE: {cor}. Use this as a controlled accent, not a full-image filter. "
        "Let the accent interact with the lighting, materials and atmosphere. The faction palette remains the stronger identity cue."
    )
    blocos.append(
        "ARTIST EXECUTION CHECKLIST: show one dominant subject and one readable story beat; specify visible anatomy, clothing, armor, weapon or artifact construction; "
        "make the environment reinforce the card's actual role; keep foreground, subject plane and background distinct; use motivated key light and restrained rim light; "
        "keep face, hands, weapon and important silhouette inside safe margins. Every object must have a reason to be in the scene.\n\n"
        "NEGATIVE CONSTRAINTS: no generic fantasy stock character, no random dragon/skull/castle unless the card data calls for it, no unrelated companions, no extra weapons, "
        "no contradictory faction colors, no ability symbols that look like interface icons, no split panels, no collage, no illegible runes, no text, no logo, no watermark, "
        "no card frame, no card border, no title, no stats, no rarity gem and no UI.\n\n"
        "FINAL OUTPUT: original standalone landscape 5:4 illustration only, designed to fit behind the official NARABOT card frame. "
        "The renderer adds the frame, name, stats and ability separately. Do not draw or simulate any of those elements."
    )
    return "\n\n".join(blocos)


def normalizar_imagem_carta(dados: bytes) -> ImagemNormalizada:
    """Valida, remove metadados e padroniza a imagem em memória para o Discord."""
    if not dados:
        raise ArteInvalida("O arquivo está vazio. Envie uma imagem PNG, JPG ou WEBP.")
    if len(dados) > TAMANHO_MAXIMO_UPLOAD:
        raise ArteInvalida("A imagem ultrapassa 8 MB. Exporte uma versão menor e envie novamente.")

    try:
        with Image.open(io.BytesIO(dados)) as original:
            if getattr(original, "n_frames", 1) > 1:
                raise ArteInvalida("Envie uma imagem estática; GIFs e animações não são aceitos.")
            if original.format not in {"PNG", "JPEG", "WEBP"}:
                raise ArteInvalida("Formato não aceito. Utilize PNG, JPG ou WEBP.")
            largura, altura = original.size
            if largura < 512 or altura < 512:
                raise ArteInvalida("A imagem precisa ter pelo menos 512 × 512 pixels para manter a qualidade.")
            if largura > 6000 or altura > 6000 or largura * altura > PIXELS_MAXIMOS:
                raise ArteInvalida("A resolução é excessiva. Reduza a imagem para no máximo 18 megapixels.")

            orientada = ImageOps.exif_transpose(original)
            if orientada.mode in {"RGBA", "LA"} or "transparency" in orientada.info:
                camada = orientada.convert("RGBA")
                fundo = Image.new("RGBA", camada.size, (16, 19, 25, 255))
                fundo.alpha_composite(camada)
                imagem = fundo.convert("RGB")
            else:
                imagem = orientada.convert("RGB")
            imagem = ImageOps.fit(
                imagem,
                (ARTE_LARGURA, ARTE_ALTURA),
                method=Image.Resampling.LANCZOS,
                centering=(0.5, 0.48),
            )
            saida = io.BytesIO()
            imagem.save(saida, format="JPEG", quality=91, optimize=True, progressive=True)
            normalizada = saida.getvalue()
            if len(normalizada) > TAMANHO_MAXIMO_UPLOAD:
                saida = io.BytesIO()
                imagem.save(saida, format="JPEG", quality=84, optimize=True, progressive=True)
                normalizada = saida.getvalue()
            if len(normalizada) > TAMANHO_MAXIMO_UPLOAD:
                raise ArteInvalida("Não consegui reduzir a imagem o suficiente. Envie uma versão com menos detalhes ou resolução menor.")
            return ImagemNormalizada(normalizada, ARTE_LARGURA, ARTE_ALTURA)
    except ArteInvalida:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError, SyntaxError, OverflowError) as exc:
        raise ArteInvalida("Não consegui abrir essa imagem. Envie um PNG, JPG ou WEBP válido.") from exc
