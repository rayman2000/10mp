"""
Pokemon Fire Red Game State Event Server with LED Integration

A FastAPI server that receives real-time game state updates and controls NeoPixel LEDs
with synchronized animations for locations, battles, and game events.

Hardware Requirements:
    - Raspberry Pi (tested on Pi 4)
    - NeoPixel LED Strip (WS281x compatible)
    - Connected to GPIO Pin D10 (configurable)

Software Requirements:
    pip install fastapi uvicorn pydantic
    pip install adafruit-blinka adafruit-circuitpython-neopixel rpi_ws281x --break-system-packages

Usage:
    python gamestate_server_with_leds.py

    Or with uvicorn:
    uvicorn gamestate_server_with_leds:app --host 127.0.0.1 --port 3333

API Documentation:
    http://localhost:3333/docs (Swagger UI)
    http://localhost:3333/redoc (ReDoc)

GPIO Permissions:
    See setup_gpio_permissions.sh for fixing root permission requirements
"""

from datetime import datetime
from typing import List, Optional, Union
from enum import Enum
import time
import math
import random
import threading
import socket
import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# LED imports (graceful degradation if not available)
LED_AVAILABLE = False
try:
    import board
    import neopixel
    LED_AVAILABLE = True
    print("✅ LED hardware support loaded")
except (ImportError, NotImplementedError) as e:
    print(f"⚠️  LED hardware not available: {e}")
    print("   Server will run without LED control")


# ============================================================================
# LED Controller Configuration
# ============================================================================

LED_COUNT = 50
LED_BRIGHTNESS = 1.0
LED_ORDER_GRB = True  # Set to False for RGB order

# Try to get the pin (will fail gracefully if board not available)
try:
    LED_PIN = board.D10
except:
    LED_PIN = None


# ============================================================================
# Color Definitions
# ============================================================================

COLOR_OFF = (0, 0, 0)
COLOR_WHITE = (255, 255, 255)
COLOR_RED = (255, 0, 0)

# Pokemon Type Colors (Gen 3)
TYPE_COLORS = {
    "normal":   (168, 168, 120),
    "fire":     (240, 128, 48),
    "water":    (104, 144, 240),
    "grass":    (120, 200, 80),
    "electric": (248, 208, 48),
    "ice":      (152, 216, 216),
    "fighting": (192, 48, 40),
    "poison":   (160, 64, 160),
    "ground":   (224, 192, 104),
    "flying":   (168, 144, 240),
    "psychic":  (248, 88, 136),
    "bug":      (168, 184, 32),
    "rock":     (184, 160, 56),
    "ghost":    (112, 88, 152),
    "dragon":   (112, 56, 248),
    "steel":    (184, 184, 208),
    "dark":     (112, 88, 72),
}

# Pokemon name to type mapping (Kanto 151)
POKEMON_TYPES = {
    "bulbasaur": "grass",
    "ivysaur": "grass",
    "venusaur": "grass",
    "charmander": "fire",
    "charmeleon": "fire",
    "charizard": "fire",
    "squirtle": "water",
    "wartortle": "water",
    "blastoise": "water",
    "caterpie": "bug",
    "metapod": "bug",
    "butterfree": "bug",
    "weedle": "bug",
    "kakuna": "bug",
    "beedrill": "bug",
    "pidgey": "normal",
    "pidgeotto": "normal",
    "pidgeot": "normal",
    "rattata": "normal",
    "raticate": "normal",
    "spearow": "normal",
    "fearow": "normal",
    "ekans": "poison",
    "arbok": "poison",
    "pikachu": "electric",
    "raichu": "electric",
    "sandshrew": "ground",
    "sandslash": "ground",
    "nidoran-f": "poison",
    "nidorina": "poison",
    "nidoqueen": "poison",
    "nidoran-m": "poison",
    "nidorino": "poison",
    "nidoking": "poison",
    "clefairy": "normal",
    "clefable": "normal",
    "vulpix": "fire",
    "ninetales": "fire",
    "jigglypuff": "normal",
    "wigglytuff": "normal",
    "zubat": "poison",
    "golbat": "poison",
    "oddish": "grass",
    "gloom": "grass",
    "vileplume": "grass",
    "paras": "bug",
    "parasect": "bug",
    "venonat": "bug",
    "venomoth": "bug",
    "diglett": "ground",
    "dugtrio": "ground",
    "meowth": "normal",
    "persian": "normal",
    "psyduck": "water",
    "golduck": "water",
    "mankey": "fighting",
    "primeape": "fighting",
    "growlithe": "fire",
    "arcanine": "fire",
    "poliwag": "water",
    "poliwhirl": "water",
    "poliwrath": "water",
    "abra": "psychic",
    "kadabra": "psychic",
    "alakazam": "psychic",
    "machop": "fighting",
    "machoke": "fighting",
    "machamp": "fighting",
    "bellsprout": "grass",
    "weepinbell": "grass",
    "victreebel": "grass",
    "tentacool": "water",
    "tentacruel": "water",
    "geodude": "rock",
    "graveler": "rock",
    "golem": "rock",
    "ponyta": "fire",
    "rapidash": "fire",
    "slowpoke": "water",
    "slowbro": "water",
    "magnemite": "electric",
    "magneton": "electric",
    "farfetchd": "normal",
    "doduo": "normal",
    "dodrio": "normal",
    "seel": "water",
    "dewgong": "water",
    "grimer": "poison",
    "muk": "poison",
    "shellder": "water",
    "cloyster": "water",
    "gastly": "ghost",
    "haunter": "ghost",
    "gengar": "ghost",
    "onix": "rock",
    "drowzee": "psychic",
    "hypno": "psychic",
    "krabby": "water",
    "kingler": "water",
    "voltorb": "electric",
    "electrode": "electric",
    "exeggcute": "grass",
    "exeggutor": "grass",
    "cubone": "ground",
    "marowak": "ground",
    "hitmonlee": "fighting",
    "hitmonchan": "fighting",
    "lickitung": "normal",
    "koffing": "poison",
    "weezing": "poison",
    "rhyhorn": "ground",
    "rhydon": "ground",
    "chansey": "normal",
    "tangela": "grass",
    "kangaskhan": "normal",
    "horsea": "water",
    "seadra": "water",
    "goldeen": "water",
    "seaking": "water",
    "staryu": "water",
    "starmie": "water",
    "mrmime": "psychic",
    "scyther": "bug",
    "jynx": "ice",
    "electabuzz": "electric",
    "magmar": "fire",
    "pinsir": "bug",
    "tauros": "normal",
    "magikarp": "water",
    "gyarados": "water",
    "lapras": "water",
    "ditto": "normal",
    "eevee": "normal",
    "vaporeon": "water",
    "jolteon": "electric",
    "flareon": "fire",
    "porygon": "normal",
    "omanyte": "rock",
    "omastar": "rock",
    "kabuto": "rock",
    "kabutops": "rock",
    "aerodactyl": "rock",
    "snorlax": "normal",
    "articuno": "ice",
    "zapdos": "electric",
    "moltres": "fire",
    "dratini": "dragon",
    "dragonair": "dragon",
    "dragonite": "dragon",
    "mewtwo": "psychic",
    "mew": "psychic"
}

# Location color schemes [Primary, Secondary, Accent]
LOCATION_COLORS = {
    # Special locations
    "pokecenter":      [(248, 56, 56),   (255, 255, 255), (255, 220, 100)],
    "pokemart":        [(48, 128, 248),  (255, 255, 255), (100, 200, 100)],
    "gym":             [(160, 160, 160), (220, 200, 100), (100, 80, 50)],
    "unknown":         [(50, 50, 50),    (100, 100, 100), (200, 200, 200)],

    # Towns/Cities
    "pallet town":     [(112, 192, 80),  (232, 232, 232), (192, 160, 112)],
    "viridian city":   [(80, 128, 88),   (120, 112, 80),  (56, 88, 56)],
    "pewter city":     [(144, 144, 128), (112, 160, 112), (160, 128, 96)],
    "cerulean city":   [(64, 160, 248),  (112, 224, 248), (248, 248, 248)],
    "vermilion city":  [(232, 144, 56),  (240, 192, 80),  (104, 160, 240)],
    "lavender town":   [(144, 112, 176), (88, 64, 112),   (192, 168, 208)],
    "celadon city":    [(120, 200, 80),  (80, 160, 120),  (248, 248, 200)],
    "fuchsia city":    [(224, 80, 144),  (112, 192, 80),  (160, 112, 64)],
    "saffron city":    [(248, 208, 48),  (192, 192, 192), (248, 248, 248)],
    "cinnabar island": [(224, 64, 64),   (128, 64, 64),   (240, 160, 128)],

    # Routes
    "route generic":   [(120, 200, 80),  (224, 192, 96),  (56, 112, 48)],
    "route mountain":  [(160, 144, 112), (128, 112, 88),  (88, 160, 88)],
    "route water":     [(64, 128, 240),  (104, 176, 248), (224, 240, 255)],

    # --- DUNGEONS & INTERIORS ---
    # Deep forest green, shadow green, filtered light
    "viridian forest": [(48, 96, 56),    (24, 56, 32),    (136, 184, 104)],
    # Cave brown, dark shadow, rocky beige
    "mt moon":         [(120, 104, 88),  (64, 56, 48),    (168, 152, 128)],
    # Darker brown, pitch black darkness, flash light halo
    "rock tunnel":     [(136, 112, 88),  (32, 24, 24),    (192, 176, 144)],
    # Tower purple/wood, fog grey, ghost aura
    "pokemon tower":   [(112, 96, 144),  (80, 64, 104),   (176, 160, 192)],
    # Dirt brown, tunnel shadow, ladder wood
    "diglett's cave":  [(152, 128, 96),  (80, 64, 48),    (184, 160, 120)],
    # Savanna yellow/green, marsh water, wood
    "safari zone":     [(144, 192, 88),  (216, 208, 160), (64, 128, 160)],
    # Industrial grey, electric yellow, caution stripe orange
    "power plant":     [(88, 88, 96),    (240, 224, 64),  (216, 104, 48)],
    # Ice blue, white snow, deep cave water
    "seafoam islands": [(104, 192, 224), (248, 255, 255), (48, 80, 128)],
    # Burnt burgundy, charred wood, broken grey
    "pokemon mansion": [(160, 88, 88),   (88, 56, 56),    (144, 128, 128)],
    # Victory brown, puzzle boulder grey, lava hint
    "victory road":    [(128, 104, 80),  (160, 160, 168), (192, 168, 128)],
    # Mysterious crystal blue, purple rock, water
    "cerulean cave":   [(104, 96, 160),  (64, 56, 112),   (104, 200, 224)],
    # Corporate blue carpet, warp pad red, metal grey
    "silph co":        [(80, 112, 160),  (216, 64, 64),   (192, 192, 208)],

    # --- SEVII ISLANDS ---
    # Tropical sand, bright teal water, palm green
    "one island":      [(248, 240, 176), (40, 168, 200),  (80, 192, 80)],
    # Volcanic exterior, lava red, ash
    "mt ember":        [(168, 80, 64),   (240, 128, 48),  (88, 40, 40)],
    # Dense forest, berry colors, swampy green
    "berry forest":    [(56, 128, 64),   (176, 80, 112),  (32, 64, 48)],
    # Ice lore, light blue, ancient stone
    "icefall cave":    [(176, 224, 248), (224, 240, 255), (112, 144, 176)],
    # Ruins gold/tan, unown mystery blue, sand
    "tanoby ruins":    [(200, 176, 128), (56, 104, 168),  (224, 208, 160)],
}


def get_location_colors(location_name):
    """Parse location name and return matching color palette"""
    if not location_name:
        return LOCATION_COLORS["unknown"]

    name = location_name.lower().strip()

    # Direct match
    if name in LOCATION_COLORS:
        return LOCATION_COLORS[name]

    # Route parsing
    if "route" in name:
        num_str = ''.join(filter(str.isdigit, name))
        if num_str:
            n = int(num_str)
            if n in [19, 20, 21]:
                return LOCATION_COLORS["route water"]
            elif n in [3, 4, 9, 10, 23]:
                return LOCATION_COLORS["route mountain"]
        return LOCATION_COLORS["route generic"]

    # Fallback
    return LOCATION_COLORS["unknown"]


def get_pokemon_type(pokemon_name):
    """Get Pokemon type from name"""
    if not pokemon_name:
        return "normal"
    name = pokemon_name.lower().strip()
    return POKEMON_TYPES.get(name, "normal")


# ============================================================================
# LED Controller Class
# ============================================================================

class LedController:
    """Controls NeoPixel LED strip with game-synchronized animations"""

    def __init__(self):
        if not LED_AVAILABLE or LED_PIN is None:
            print("⚠️  LED Controller running in MOCK mode (no hardware)")
            self.mock_mode = True
            self.current_state = "IDLE"
            self.state_data = {}
            self.running = True
            return

        self.mock_mode = False

        # Initialize LED strip
        try:
            pixel_order = neopixel.GRB if LED_ORDER_GRB else neopixel.RGB
            self.pixels = neopixel.NeoPixel(
                LED_PIN, LED_COUNT,
                brightness=LED_BRIGHTNESS,
                auto_write=False,
                pixel_order=pixel_order
            )
            print(f"✅ LED strip initialized: {LED_COUNT} pixels on GPIO D10")
        except Exception as e:
            print(f"❌ Failed to initialize LEDs: {e}")
            self.mock_mode = True
            return

        # State management
        self.current_state = "IDLE"
        self.state_data = {}
        self.running = True
        self.last_enemy_type = "normal"  # Track last enemy for damage animation

        # Start animation thread
        self.thread = threading.Thread(target=self._loop_manager, daemon=True)
        self.thread.start()

    def set_state(self, new_state, data=None):
        """Change animation mode"""
        print(f"🎨 LED State: {new_state} | Data: {data}")
        self.state_data = data if data else {}
        self.current_state = new_state

    def stop(self):
        """Stop all animations and turn off LEDs"""
        self.running = False
        if not self.mock_mode:
            self.pixels.fill(COLOR_OFF)
            self.pixels.show()

    def _loop_manager(self):
        """Main animation loop dispatcher"""
        if self.mock_mode:
            return

        while self.running:
            try:
                if self.current_state == "WALKING":
                    colors = self.state_data.get("colors", LOCATION_COLORS["route generic"])
                    self._anim_walking(colors)

                elif self.current_state == "ENCOUNTER":
                    self._anim_encounter()

                elif self.current_state == "FIGHTING":
                    pokemon_type = self.state_data.get("type", "normal")
                    self.last_enemy_type = pokemon_type  # Remember for damage animation
                    self._anim_fighting(pokemon_type)

                elif self.current_state == "SWITCH":
                    old = self.state_data.get("old", "normal")
                    new = self.state_data.get("new", "normal")
                    self._anim_switch(old, new)

                elif self.current_state == "DAMAGE":
                    self._anim_damage()

                elif self.current_state == "LEVEL_UP":
                    self._anim_levelup()

                elif self.current_state == "IDLE":
                    self.pixels.fill(COLOR_OFF)
                    self.pixels.show()
                    time.sleep(0.1)

            except Exception as e:
                print(f"❌ Animation error: {e}")
                time.sleep(0.1)

    # --- Animation Implementations ---

    def _anim_walking(self, colors):
        """Smooth sine-wave movement animation"""
        offset = 0.0
        step_size = 0.15
        wave_density = 0.6

        if len(colors) < 3:
            colors = (colors * 3)[:3]

        while self.current_state == "WALKING" and self.running:
            for i in range(LED_COUNT):
                theta = (i * wave_density) + offset
                val = math.sin(theta)
                brightness = ((val + 1) / 2.0) ** 3

                cycle_index = int((theta + math.pi/2) / (2 * math.pi))
                block_idx = cycle_index % 3
                base_color = colors[block_idx]

                r = int(base_color[0] * brightness)
                g = int(base_color[1] * brightness)
                b = int(base_color[2] * brightness)
                self.pixels[i] = (r, g, b)

            self.pixels.show()
            offset -= step_size
            time.sleep(0.02)

    def _anim_encounter(self):
        """Chaotic strobe effect for wild encounter"""
        while self.current_state == "ENCOUNTER" and self.running:
            # White flash
            self.pixels.fill((100, 150, 150))
            self.pixels.show()
            time.sleep(0.2)

            # Off
            self.pixels.fill(COLOR_OFF)
            self.pixels.show()
            time.sleep(0.2)

            # Random noise
            for i in range(LED_COUNT):
                self.pixels[i] = (random.randint(0, 255), random.randint(0, 50), 0)
            self.pixels.show()
            time.sleep(0.2)

    def _anim_fighting(self, pokemon_type):
        """Pulsating breathe effect"""
        base_color = TYPE_COLORS.get(pokemon_type, TYPE_COLORS["normal"])

        while self.current_state == "FIGHTING" and self.running:
            t = time.time() * 3
            factor = (math.sin(t) + 1) / 2
            factor = 0.2 + (0.8 * factor)

            current_color = (
                int(base_color[0] * factor),
                int(base_color[1] * factor),
                int(base_color[2] * factor)
            )

            self.pixels.fill(current_color)
            self.pixels.show()
            time.sleep(0.02)

    def _anim_switch(self, old_type, new_type):
        """Pokemon switch wipe effect"""
        c_old = TYPE_COLORS.get(old_type, TYPE_COLORS["normal"])
        c_new = TYPE_COLORS.get(new_type, TYPE_COLORS["normal"])
        center = LED_COUNT // 2

        # Retract
        self.pixels.fill(c_old)
        for i in range(center):
            self.pixels[i] = COLOR_OFF
            self.pixels[LED_COUNT - 1 - i] = COLOR_OFF
            self.pixels.show()
            time.sleep(0.02)

        time.sleep(0.1)

        # Expand
        for i in range(center):
            self.pixels[center + i] = c_new
            self.pixels[center - 1 - i] = c_new
            self.pixels.show()
            time.sleep(0.03)

        # Return to fighting with new type
        self.set_state("FIGHTING", {"type": new_type})

    def _anim_damage(self):
        """Flash effect for damage"""
        # White impact
        self.pixels.fill(COLOR_WHITE)
        self.pixels.show()
        time.sleep(0.1)

        # Red blink
        for _ in range(3):
            self.pixels.fill(COLOR_RED)
            self.pixels.show()
            time.sleep(0.1)
            self.pixels.fill((50, 0, 0))
            self.pixels.show()
            time.sleep(0.1)

        # Return to fighting with last known enemy type
        self.set_state("FIGHTING", {"type": self.last_enemy_type})

    def _anim_levelup(self):
        """Rainbow cycle for level up"""
        j = 0

        def wheel(pos):
            if pos < 85:
                return (pos * 3, 255 - pos * 3, 0)
            elif pos < 170:
                pos -= 85
                return (255 - pos * 3, 0, pos * 3)
            else:
                pos -= 170
                return (0, pos * 3, 255 - pos * 3)

        while self.current_state == "LEVEL_UP" and self.running:
            for i in range(LED_COUNT):
                pixel_index = (i * 256 // LED_COUNT) + j
                self.pixels[i] = wheel(pixel_index & 255)
            self.pixels.show()
            j += 3
            time.sleep(0.002)


# ============================================================================
# FastAPI Event Models
# ============================================================================

class LocationChangeData(BaseModel):
    from_location: str = Field(..., alias="from")
    to: str
    class Config:
        populate_by_name = True

class BattleStartData(BaseModel):
    pass

class BattleEndData(BaseModel):
    pass

class EnemyAppearedData(BaseModel):
    pokemon: str
    level: int
    hp: int
    maxHp: int = Field(..., alias="maxHp")
    class Config:
        populate_by_name = True

class EnemySwitchedData(BaseModel):
    pokemon: str
    level: int
    hp: int
    maxHp: int = Field(..., alias="maxHp")
    class Config:
        populate_by_name = True

class EnemyHPChangeData(BaseModel):
    pokemon: str
    oldHp: int = Field(..., alias="oldHp")
    newHp: int = Field(..., alias="newHp")
    delta: int
    class Config:
        populate_by_name = True

class LevelUpData(BaseModel):
    pokemon: str
    oldLevel: int = Field(..., alias="oldLevel")
    newLevel: int = Field(..., alias="newLevel")
    class Config:
        populate_by_name = True

class EventType(str, Enum):
    LOCATION_CHANGE = "location_change"
    BATTLE_START = "battle_start"
    BATTLE_END = "battle_end"
    ENEMY_APPEARED = "enemy_appeared"
    ENEMY_SWITCHED = "enemy_switched"
    ENEMY_HP_CHANGE = "enemy_hp_change"
    LEVEL_UP = "level_up"

class GameEvent(BaseModel):
    type: EventType
    timestamp: datetime
    data: Union[
        LocationChangeData,
        BattleStartData,
        BattleEndData,
        EnemyAppearedData,
        EnemySwitchedData,
        EnemyHPChangeData,
        LevelUpData,
        dict
    ]

class PartyPokemon(BaseModel):
    nickname: str
    level: int
    currentHp: int = Field(..., alias="currentHp")
    maxHp: int = Field(..., alias="maxHp")
    class Config:
        populate_by_name = True

class CurrentState(BaseModel):
    location: Optional[str] = None
    inBattle: bool = Field(..., alias="inBattle")
    money: Optional[int] = None
    badges: Optional[int] = Field(None, alias="badges")
    playtime: int
    party: List[PartyPokemon] = Field(default_factory=list)
    class Config:
        populate_by_name = True

class GameStatePayload(BaseModel):
    timestamp: datetime
    events: List[GameEvent]
    currentState: CurrentState = Field(..., alias="currentState")
    class Config:
        populate_by_name = True


# ============================================================================
# Event Handler with LED Integration
# ============================================================================

class EventHandler:
    """Process game events and control LED animations"""

    def __init__(self, led_controller: LedController):
        self.leds = led_controller
        self.current_location = None
        self.current_enemy_type = "normal"

    def handle_location_change(self, data: LocationChangeData, state: CurrentState):
        """Player moved to new location"""
        print(f"📍 Location: {data.from_location} → {data.to}")
        self.current_location = data.to

        # Update LED colors if not in battle
        if not state.inBattle:
            colors = get_location_colors(data.to)
            self.leds.set_state("WALKING", {"colors": colors})

    def handle_battle_start(self, data: BattleStartData, state: CurrentState):
        """Battle initiated"""
        print(f"⚔️  Battle started at {state.location}")
        self.leds.set_state("ENCOUNTER")

    def handle_battle_end(self, data: BattleEndData, state: CurrentState):
        """Battle concluded"""
        print(f"✅ Battle ended")
        # Return to walking animation with current location colors
        if self.current_location:
            colors = get_location_colors(self.current_location)
            self.leds.set_state("WALKING", {"colors": colors})
        else:
            self.leds.set_state("IDLE")

    def handle_enemy_appeared(self, data: EnemyAppearedData, state: CurrentState):
        """Enemy Pokemon entered battle"""
        print(f"👾 Enemy: {data.pokemon} Lv.{data.level} ({data.hp}/{data.maxHp} HP)")

        # Get Pokemon type and start fighting animation
        pokemon_type = get_pokemon_type(data.pokemon)
        self.current_enemy_type = pokemon_type
        self.leds.set_state("FIGHTING", {"type": pokemon_type})

    def handle_enemy_switched(self, data: EnemySwitchedData, state: CurrentState):
        """Enemy switched Pokemon"""
        print(f"↻  Enemy switched to: {data.pokemon} Lv.{data.level}")

        old_type = self.current_enemy_type
        new_type = get_pokemon_type(data.pokemon)
        self.current_enemy_type = new_type

        self.leds.set_state("SWITCH", {"old": old_type, "new": new_type})

    def handle_enemy_hp_change(self, data: EnemyHPChangeData, state: CurrentState):
        """Enemy HP changed"""
        delta_str = f"+{data.delta}" if data.delta > 0 else str(data.delta)
        print(f"❤️  {data.pokemon} HP: {data.oldHp} → {data.newHp} ({delta_str})")

        # Only show damage animation for damage (negative delta)
        if data.delta < 0:
            self.leds.set_state("DAMAGE", {"type": self.current_enemy_type})

    def handle_level_up(self, data: LevelUpData, state: CurrentState):
        """Pokemon leveled up"""
        level_gain = data.newLevel - data.oldLevel
        print(f"🆙 {data.pokemon} leveled up! Lv.{data.oldLevel} → Lv.{data.newLevel} (+{level_gain})")

        self.leds.set_state("LEVEL_UP")

    def process_events(self, payload: GameStatePayload):
        """Process all events in payload"""
        if not payload.events:
            return

        print(f"\n{'='*60}")
        print(f"📦 {len(payload.events)} event(s) at {payload.timestamp}")
        print(f"📍 {payload.currentState.location} | Battle: {payload.currentState.inBattle}")
        print(f"🎒 Party: {len(payload.currentState.party)} | 💰 ${payload.currentState.money} | 🏅 {payload.currentState.badges}")
        print(f"{'='*60}")

        for event in payload.events:
            if event.type == EventType.LOCATION_CHANGE:
                self.handle_location_change(event.data, payload.currentState)
            elif event.type == EventType.BATTLE_START:
                self.handle_battle_start(event.data, payload.currentState)
            elif event.type == EventType.BATTLE_END:
                self.handle_battle_end(event.data, payload.currentState)
            elif event.type == EventType.ENEMY_APPEARED:
                self.handle_enemy_appeared(event.data, payload.currentState)
            elif event.type == EventType.ENEMY_SWITCHED:
                self.handle_enemy_switched(event.data, payload.currentState)
            elif event.type == EventType.ENEMY_HP_CHANGE:
                self.handle_enemy_hp_change(event.data, payload.currentState)
            elif event.type == EventType.LEVEL_UP:
                self.handle_level_up(event.data, payload.currentState)


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="Pokemon Fire Red Game State Server with LEDs",
    description="Receives game state updates and controls NeoPixel LED animations",
    version="2.0.0"
)

# Add CORS middleware to allow requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (localhost:3000, localhost:80, etc.)
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)

# Initialize LED controller and event handler
led_controller = LedController()
event_handler = EventHandler(led_controller)


@app.post("/gamestate")
async def receive_game_state(payload: GameStatePayload):
    """Receive game state update and trigger LED animations"""
    try:
        event_handler.process_events(payload)
        return JSONResponse(
            status_code=200,
            content={"status": "ok", "events_processed": len(payload.events)}
        )
    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    """Server info"""
    return {
        "name": "Pokemon Fire Red Game State Server with LEDs",
        "version": "2.0.0",
        "led_hardware": "connected" if LED_AVAILABLE and not led_controller.mock_mode else "mock mode",
        "led_count": LED_COUNT,
        "endpoints": {
            "POST /gamestate": "Receive game state updates",
            "GET /health": "Health check",
            "GET /docs": "API documentation"
        }
    }


def get_local_interfaces():
    """Get local network interfaces (Ethernet and WiFi)"""
    interfaces = []

    # Get all network interfaces
    try:
        import netifaces
        for iface in netifaces.interfaces():
            # Skip loopback and virtual interfaces
            if iface in ['lo', 'docker0'] or iface.startswith(('br-', 'veth', 'virbr')):
                continue

            addrs = netifaces.ifaddresses(iface)
            if netifaces.AF_INET in addrs:
                for addr_info in addrs[netifaces.AF_INET]:
                    ip = addr_info.get('addr')
                    if ip and ip != '127.0.0.1':
                        # Determine interface type
                        iface_type = 'ethernet' if iface.startswith(('eth', 'en', 'em')) else \
                                     'wifi' if iface.startswith(('wlan', 'wl')) else 'other'
                        interfaces.append({
                            'interface': iface,
                            'address': ip,
                            'type': iface_type
                        })
    except ImportError:
        # Fallback: use socket to get primary IP (less detailed)
        try:
            # Connect to external IP to determine local interface IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
            s.close()
            if ip and ip != '127.0.0.1':
                interfaces.append({
                    'interface': 'primary',
                    'address': ip,
                    'type': 'unknown'
                })
        except Exception:
            pass

    return interfaces


@app.get("/health")
async def health_check():
    """Health check with local network interface information"""
    interfaces = get_local_interfaces()

    return {
        "status": "healthy",
        "led_status": "active" if LED_AVAILABLE and not led_controller.mock_mode else "mock",
        "timestamp": datetime.now().isoformat(),
        "network_interfaces": interfaces,
        "hostname": socket.gethostname()
    }


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    led_controller.stop()


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    print("""
    ╔════════════════════════════════════════════════════════════════════╗
    ║  Pokemon Fire Red Game State Server with LED Integration           ║
    ║                                                                    ║
    ║  🔒 SECURITY: Bound to localhost only (127.0.0.1)                  ║
    ║      External connections are blocked                             ║
    ║                                                                    ║
    ║  💡 LED Status: {:<49} ║
    ║  📍 GPIO Pin: D10 | LED Count: {:<33} ║
    ║                                                                    ║
    ║  📚 API Docs: http://localhost:3333/docs                           ║
    ║                                                                    ║
    ║  ⚠️  GPIO Permissions: Run setup_gpio_permissions.sh if needed     ║
    ╚════════════════════════════════════════════════════════════════════╝
    """.format(
        "Connected ✅" if LED_AVAILABLE and not led_controller.mock_mode else "Mock Mode ⚠️ ",
        str(LED_COUNT)
    ))

    try:
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=3333,
            log_level="info"
        )
    finally:
        led_controller.stop()
