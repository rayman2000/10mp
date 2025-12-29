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
    # Normal: Warm beige/grey (dimmed to avoid looking pure white)
    "normal":   (160, 160, 130),
    
    # Fire: Pure, sharp Orange-Red
    "fire":     (255, 80, 0),
    
    # Water: Deep, rich Blue (removed green tint)
    "water":    (0, 80, 255),
    
    # Grass: Pure Green (removed yellow tint)
    "grass":    (0, 200, 20),
    
    # Electric: Pure Yellow (Red/Green mix, Blue dropped to 0)
    "electric": (255, 220, 0),
    
    # Ice: Cyan/Turquoise (Distinct from Water)
    "ice":      (0, 200, 200),
    
    # Fighting: Deep Crimson/Blood Red (Distinct from Fire)
    "fighting": (200, 20, 20),
    
    # Poison: Deep Violet (Distinct from Psychic)
    "poison":   (150, 0, 200),
    
    # Ground: Earthy Gold/Orange (Distinct from Rock)
    "ground":   (180, 140, 20),
    
    # Flying: Light Sky Blue/Indigo
    "flying":   (100, 120, 255),
    
    # Psychic: Hot Pink/Magenta
    "psychic":  (255, 20, 150),
    
    # Bug: Lime Green (Distinct from Grass)
    "bug":      (160, 220, 0),
    
    # Rock: Desaturated Brown/Grey
    "rock":     (120, 100, 80),
    
    # Ghost: Dark Indigo/Purple
    "ghost":    (80, 40, 180),
    
    # Dragon: Deep Royal Blue/Purple
    "dragon":   (60, 0, 255),
    
    # Steel: Cool Blue-Grey (Distinct from Normal)
    "steel":    (100, 140, 160),
    
    # Dark: Very dim Red/Brown (Hard on LEDs, used low intensity)
    "dark":     (60, 40, 40),
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
    # --- SPECIAL LOCATIONS ---
    # Pokecenter: Pure Red, Dim Neutral White, Sharp Gold
    "pokecenter":      [(255, 0, 0),     (128, 128, 128), (255, 180, 0)],
    # Pokemart: Deep Blue, Dim White, Bright Lime
    "pokemart":        [(0, 0, 255),     (128, 128, 128), (0, 255, 0)],
    # Gym: Stone Grey, Deep Gold, Wood Brown
    "gym":             [(80, 80, 80),    (255, 200, 0),   (139, 69, 19)],
    "unknown":         [(30, 30, 30),    (80, 80, 80),    (150, 150, 150)],

    # --- TOWNS/CITIES ---
    # Pallet: Fresh bright green, Off-white, Wood
    "pallet town":     [(0, 255, 50),    (150, 150, 150), (160, 100, 50)],
    # Viridian: Deep Forest Green, Khaki, Dark Green
    "viridian city":   [(0, 100, 0),     (150, 140, 50),  (0, 50, 0)],
    # Pewter: Slate Grey, Pale Green, Rock Brown
    "pewter city":     [(100, 100, 100), (80, 120, 80),   (100, 80, 60)],
    # Cerulean: Deep Cyan, Sky Blue, White
    "cerulean city":   [(0, 180, 255),   (0, 100, 255),   (180, 180, 180)],
    # Vermilion: Vivid Orange, Yellow, Ocean Blue
    "vermilion city":  [(255, 100, 0),   (255, 220, 0),   (0, 50, 255)],
    # Lavender: Deep Purple, Dark Indigo, Mist
    "lavender town":   [(150, 0, 200),   (60, 0, 100),    (160, 120, 200)],
    # Celadon: Vibrant Lime, Urban Grey, Window Yellow
    "celadon city":    [(50, 200, 0),    (100, 100, 100), (220, 220, 0)],
    # Fuchsia: Hot Pink, Green, Beige
    "fuchsia city":    [(255, 0, 150),   (0, 180, 0),     (180, 160, 100)],
    # Saffron: Gold, Silver, White (reduced blue channel)
    "saffron city":    [(255, 180, 0),   (150, 150, 150), (200, 200, 200)],
    # Cinnabar: Red, Dark Red, Ash Grey
    "cinnabar island": [(255, 30, 30),   (150, 0, 0),     (100, 100, 100)],
    # Indigo: Marble White, Regal Blue, Gold
    "indigo plateau":  [(180, 180, 180), (0, 0, 180),     (255, 200, 0)],

    # --- ROUTES ---
    # Route: Standard Green, Dirt Path, Bushes
    "route generic":   [(0, 180, 0),     (180, 140, 20),  (0, 80, 0)],
    # Mountain: Brown, Grey, Green
    "route mountain":  [(150, 100, 50),  (100, 100, 100), (0, 150, 0)],
    # Water: Pure Blue, Cyan, White foam
    "route water":     [(0, 0, 255),     (0, 150, 255),   (150, 200, 255)],
    # Cycling: Bright Yellow, Blue, Asphalt
    "cycling road":    [(255, 255, 0),   (0, 100, 255),   (80, 80, 80)],

    # --- DUNGEONS ---
    # Viridian Forest: Dark Green, Pitch Black, Light dappling
    "viridian forest": [(0, 80, 0),      (0, 10, 0),      (50, 200, 50)],
    # Mt Moon: Cave Grey, Shadow, Brown
    "mt moon":         [(100, 100, 100), (30, 30, 30),    (150, 100, 50)],
    # Rock Tunnel: Brown, Black, Flash Yellow
    "rock tunnel":     [(120, 80, 20),   (0, 0, 0),       (255, 200, 50)],
    # Pokemon Tower: Purple, Black, Ghostly Blue
    "pokemon tower":   [(100, 0, 150),   (20, 0, 40),     (100, 100, 255)],
    # Diglett: Earth Brown, Dark Brown, Wood
    "diglett's cave":  [(160, 100, 0),   (60, 30, 0),     (200, 150, 50)],
    # Safari: Jungle Green, Swamp Yellow, Water
    "safari zone":     [(0, 180, 50),    (180, 180, 50),  (0, 100, 200)],
    # Power Plant: Dark Grey, Electric Yellow, Hazard Orange
    "power plant":     [(60, 60, 60),    (255, 255, 0),   (255, 100, 0)],
    # Seafoam: Cyan, White (Ice), Deep Blue
    "seafoam islands": [(0, 255, 255),   (180, 220, 255), (0, 0, 150)],
    # Mansion: Burgundy, Charred Black, Grey
    "pokemon mansion": [(150, 0, 50),    (50, 10, 10),    (100, 100, 100)],
    # Victory Road: Brown, Boulder Grey, Lava Red
    "victory road":    [(140, 80, 40),   (120, 120, 120), (200, 50, 0)],
    # Cerulean Cave: Indigo, Dark Purple, Crystal Blue
    "cerulean cave":   [(50, 0, 200),    (30, 0, 80),     (0, 200, 255)],
    # Silph Co: Corp Blue, Warp Red, Metal
    "silph co":        [(0, 50, 180),    (200, 0, 0),     (150, 150, 160)],

    # --- SEVII ISLANDS ---
    # One Island: Sand Gold, Teal, Green
    "one island":      [(255, 180, 50),  (0, 200, 200),   (0, 200, 0)],
    # Mt Ember: Lava Red, Magma Orange, Ash
    "mt ember":        [(200, 40, 0),    (255, 100, 0),   (60, 30, 30)],
    # Berry Forest: Green, Berry Pink, Dark Green
    "berry forest":    [(0, 150, 0),     (255, 20, 100),  (0, 50, 0)],
    # Icefall: Ice Blue, White, Stone Blue
    "icefall cave":    [(0, 180, 255),   (200, 200, 255), (80, 100, 150)],
    # Tanoby: Tan, Mystery Blue, Sand
    "tanoby ruins":    [(200, 150, 50),  (0, 50, 200),    (180, 180, 100)],
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

        while self.current_state == "WALKING" and self.running:
            # Fetch current colors from state_data to support dynamic updates
            current_colors = self.state_data.get("colors", LOCATION_COLORS["route generic"])

            if len(current_colors) < 3:
                current_colors = (current_colors * 3)[:3]

            for i in range(LED_COUNT):
                theta = (i * wave_density) + offset
                val = math.sin(theta)
                brightness = ((val + 1) / 2.0) ** 3

                cycle_index = int((theta + math.pi/2) / (2 * math.pi))
                block_idx = cycle_index % 3
                base_color = current_colors[block_idx]

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
            time.sleep(0.06)

        time.sleep(0.1)

        # Expand
        for i in range(center):
            self.pixels[center + i] = c_new
            self.pixels[center - 1 - i] = c_new
            self.pixels.show()
            time.sleep(0.1)

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
