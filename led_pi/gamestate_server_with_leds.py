"""
Pokemon Fire Red Game State Event Server with Dual LED Integration
(NeoPixel + Analog RGB)

Hardware Requirements:
    - Raspberry Pi 5
    - NeoPixel LED Strip (GPIO 10 / SPI)
    - Analog RGB LED Strip (GPIO 16=Red, 20=Green, 21=Blue) via MOSFETs/Transistors

Software Requirements:
    pip install fastapi uvicorn pydantic gpiozero rpi-lgpio
    pip install adafruit-blinka adafruit-circuitpython-neopixel rpi_ws281x --break-system-packages
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

# --- Hardware Imports ---
HARDWARE_STATUS = {
    "neopixel": False,
    "analog": False
}

# 1. NeoPixel Import
try:
    import board
    import neopixel
    HARDWARE_STATUS["neopixel"] = True
except (ImportError, NotImplementedError) as e:
    print(f"⚠️  NeoPixel hardware not found: {e}")

# 2. GPIOZero Import (Analog RGB)
try:
    from gpiozero import RGBLED
    HARDWARE_STATUS["analog"] = True
except (ImportError, NotImplementedError) as e:
    print(f"⚠️  GPIOZero (Analog) not found: {e}")


# ============================================================================
# Configuration
# ============================================================================

# NeoPixel Config
LED_COUNT = 50
LED_BRIGHTNESS = 1.0
LED_ORDER_GRB = True
try:
    LED_PIN_NEO = board.D10
except:
    LED_PIN_NEO = None

# Analog RGB Config (BCM Pin Numbers)
PIN_RED = 16
PIN_GREEN = 20
PIN_BLUE = 21


# ============================================================================
# Color Definitions
# ============================================================================

COLOR_OFF = (0, 0, 0)
COLOR_WHITE = (255, 255, 255)
COLOR_RED = (255, 0, 0)

# Pokemon Type Colors (Gen 3)
TYPE_COLORS = {
    "normal":   (160, 160, 130),
    "fire":     (255, 80, 0),
    "water":    (0, 80, 255),
    "grass":    (0, 200, 20),
    "electric": (255, 220, 0),
    "ice":      (0, 200, 200),
    "fighting": (200, 20, 20),
    "poison":   (150, 0, 200),
    "ground":   (180, 140, 20),
    "flying":   (100, 120, 255),
    "psychic":  (255, 20, 150),
    "bug":      (160, 220, 0),
    "rock":     (120, 100, 80),
    "ghost":    (80, 40, 180),
    "dragon":   (60, 0, 255),
    "steel":    (100, 140, 160),
    "dark":     (60, 40, 40),
}

# Condensed Pokemon Mapping (Truncated for brevity, logic remains valid)
# The full list from your original code should be here.
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
    "pokecenter":      [(255, 0, 0),     (128, 128, 128), (255, 180, 0)],
    "pokemart":        [(0, 0, 255),     (128, 128, 128), (0, 255, 0)],
    "gym":             [(80, 80, 80),    (255, 200, 0),   (139, 69, 19)],
    "unknown":         [(30, 30, 30),    (80, 80, 80),    (150, 150, 150)],
    "pallet town":     [(0, 255, 50),    (150, 150, 150), (160, 100, 50)],
    "viridian city":   [(0, 100, 0),     (150, 140, 50),  (0, 50, 0)],
    "pewter city":     [(100, 100, 100), (80, 120, 80),   (100, 80, 60)],
    "cerulean city":   [(0, 180, 255),   (0, 100, 255),   (180, 180, 180)],
    "vermilion city":  [(255, 100, 0),   (255, 220, 0),   (0, 50, 255)],
    "lavender town":   [(150, 0, 200),   (60, 0, 100),    (160, 120, 200)],
    "celadon city":    [(50, 200, 0),    (100, 100, 100), (220, 220, 0)],
    "fuchsia city":    [(255, 0, 150),   (0, 180, 0),     (180, 160, 100)],
    "saffron city":    [(255, 180, 0),   (150, 150, 150), (200, 200, 200)],
    "cinnabar island": [(255, 30, 30),   (150, 0, 0),     (100, 100, 100)],
    "indigo plateau":  [(180, 180, 180), (0, 0, 180),     (255, 200, 0)],
    "route generic":   [(0, 180, 0),     (180, 140, 20),  (0, 80, 0)],
    "route mountain":  [(150, 100, 50),  (100, 100, 100), (0, 150, 0)],
    "route water":     [(0, 0, 255),     (0, 150, 255),   (150, 200, 255)],
    "cycling road":    [(255, 255, 0),   (0, 100, 255),   (80, 80, 80)],
    "viridian forest": [(0, 80, 0),      (0, 10, 0),      (50, 200, 50)],
    "mt moon":         [(100, 100, 100), (30, 30, 30),    (150, 100, 50)],
    "rock tunnel":     [(120, 80, 20),   (0, 0, 0),       (255, 200, 50)],
    "pokemon tower":   [(100, 0, 150),   (20, 0, 40),     (100, 100, 255)],
    "diglett's cave":  [(160, 100, 0),   (60, 30, 0),     (200, 150, 50)],
    "safari zone":     [(0, 180, 50),    (180, 180, 50),  (0, 100, 200)],
    "power plant":     [(60, 60, 60),    (255, 255, 0),   (255, 100, 0)],
    "seafoam islands": [(0, 255, 255),   (180, 220, 255), (0, 0, 150)],
    "pokemon mansion": [(150, 0, 50),    (50, 10, 10),    (100, 100, 100)],
    "victory road":    [(140, 80, 40),   (120, 120, 120), (200, 50, 0)],
    "cerulean cave":   [(50, 0, 200),    (30, 0, 80),     (0, 200, 255)],
    "silph co":        [(0, 50, 180),    (200, 0, 0),     (150, 150, 160)],
}

def get_location_colors(location_name):
    """Parse location name and return matching color palette"""
    if not location_name:
        return LOCATION_COLORS["unknown"]
    name = location_name.lower().strip()
    
    if name in LOCATION_COLORS:
        return LOCATION_COLORS[name]

    if "route" in name:
        num_str = ''.join(filter(str.isdigit, name))
        if num_str:
            n = int(num_str)
            if n in [19, 20, 21]: return LOCATION_COLORS["route water"]
            elif n in [3, 4, 9, 10, 23]: return LOCATION_COLORS["route mountain"]
        return LOCATION_COLORS["route generic"]
    
    return LOCATION_COLORS["unknown"]

def get_pokemon_type(pokemon_name):
    if not pokemon_name: return "normal"
    name = pokemon_name.lower().strip()
    return POKEMON_TYPES.get(name, "normal")


# ============================================================================
# LED Controller Class
# ============================================================================

class LedController:
    """Controls NeoPixel LED strip AND Analog RGB strip with synchronized animations"""

    def __init__(self):
        self.running = True
        self.current_state = "IDLE"
        self.state_data = {}
        self.last_enemy_type = "normal"
        
        # --- Initialize NeoPixel (RGBIC) ---
        self.pixels = None
        if HARDWARE_STATUS["neopixel"] and LED_PIN_NEO:
            try:
                pixel_order = neopixel.GRB if LED_ORDER_GRB else neopixel.RGB
                self.pixels = neopixel.NeoPixel(
                    LED_PIN_NEO, LED_COUNT,
                    brightness=LED_BRIGHTNESS,
                    auto_write=False,
                    pixel_order=pixel_order
                )
                print(f"✅ NeoPixel: Initialized {LED_COUNT}px on D10")
            except Exception as e:
                print(f"❌ NeoPixel Error: {e}")
                HARDWARE_STATUS["neopixel"] = False

        # --- Initialize Analog RGB (GPIOZero) ---
        self.analog_strip = None
        if HARDWARE_STATUS["analog"]:
            try:
                # active_high=True is standard for MOSFET driven strips
                self.analog_strip = RGBLED(red=PIN_RED, green=PIN_GREEN, blue=PIN_BLUE, active_high=True)
                print(f"✅ Analog RGB: Initialized on GPIO {PIN_RED},{PIN_GREEN},{PIN_BLUE}")
            except Exception as e:
                print(f"❌ Analog RGB Error: {e}")
                HARDWARE_STATUS["analog"] = False

        # Start animation thread
        self.thread = threading.Thread(target=self._loop_manager, daemon=True)
        self.thread.start()

    def set_analog_color(self, r, g, b, brightness=1.0):
        """Helper to safely set Analog LED color (0-255 inputs -> 0-1 outputs)"""
        if self.analog_strip:
            # Scale 0-255 to 0.0-1.0 and apply brightness factor
            rf = (r / 255.0) * brightness
            gf = (g / 255.0) * brightness
            bf = (b / 255.0) * brightness
            # Clip to 0-1
            self.analog_strip.color = (
                max(0.0, min(1.0, rf)), 
                max(0.0, min(1.0, gf)), 
                max(0.0, min(1.0, bf))
            )

    def set_state(self, new_state, data=None):
        """Change animation mode"""
        # print(f"🎨 LED State: {new_state} | Data: {data}")
        self.state_data = data if data else {}
        self.current_state = new_state

    def stop(self):
        """Stop all animations and turn off LEDs"""
        self.running = False
        if self.pixels:
            self.pixels.fill(COLOR_OFF)
            self.pixels.show()
        if self.analog_strip:
            self.analog_strip.off()
            self.analog_strip.close()

    def _loop_manager(self):
        """Main animation loop dispatcher"""
        while self.running:
            try:
                if self.current_state == "WALKING":
                    colors = self.state_data.get("colors", LOCATION_COLORS["route generic"])
                    self._anim_walking(colors)

                elif self.current_state == "ENCOUNTER":
                    self._anim_encounter()

                elif self.current_state == "FIGHTING":
                    pokemon_type = self.state_data.get("type", "normal")
                    self.last_enemy_type = pokemon_type
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
                    if self.pixels: 
                        self.pixels.fill(COLOR_OFF)
                        self.pixels.show()
                    if self.analog_strip: 
                        self.analog_strip.off()
                    time.sleep(0.1)

            except Exception as e:
                print(f"❌ Animation error: {e}")
                time.sleep(0.1)

    # --- Animation Implementations ---

    def _anim_walking(self, colors):
        """NeoPixels: Sine Wave | Analog: Gentle Pulse (Breathing)"""
        offset = 0.0
        step_size = 0.15
        wave_density = 0.6
        
        # Determine a primary color for the analog strip to breathe
        primary_color = colors[0] if colors else (100, 100, 100)

        while self.current_state == "WALKING" and self.running:
            # Update local colors in case they changed
            current_colors = self.state_data.get("colors", LOCATION_COLORS["route generic"])
            if len(current_colors) < 3: current_colors = (current_colors * 3)[:3]
            primary_color = current_colors[0]

            # 1. Analog Breathing Logic
            # Create a slow breathe effect (sin wave over time)
            t = time.time() * 1.5
            analog_brightness = (math.sin(t) + 1) / 2  # 0.0 to 1.0
            analog_brightness = 0.3 + (0.7 * analog_brightness) # floor at 30% brightness
            
            self.set_analog_color(primary_color[0], primary_color[1], primary_color[2], analog_brightness)

            # 2. NeoPixel Wave Logic
            if self.pixels:
                for i in range(LED_COUNT):
                    theta = (i * wave_density) + offset
                    val = math.sin(theta)
                    brightness = ((val + 1) / 2.0) ** 3
                    
                    block_idx = int((theta + math.pi/2) / (2 * math.pi)) % 3
                    base_color = current_colors[block_idx]

                    self.pixels[i] = (
                        int(base_color[0] * brightness),
                        int(base_color[1] * brightness),
                        int(base_color[2] * brightness)
                    )
                self.pixels.show()

            offset -= step_size
            time.sleep(0.02)

    def _anim_encounter(self):
        """Chaotic strobe effect for wild encounter (Both strips)"""
        while self.current_state == "ENCOUNTER" and self.running:
            # Flash ON
            if self.pixels:
                self.pixels.fill((100, 150, 150))
                self.pixels.show()
            self.set_analog_color(255, 255, 255, 1.0)
            
            time.sleep(0.15)

            # Flash OFF
            if self.pixels:
                self.pixels.fill(COLOR_OFF)
                self.pixels.show()
            self.set_analog_color(0, 0, 0)
            
            time.sleep(0.15)

            # Random Noise / Chaos Color
            r_chaos = random.randint(0, 255)
            g_chaos = random.randint(0, 50)
            if self.pixels:
                for i in range(LED_COUNT):
                    self.pixels[i] = (r_chaos, g_chaos, 0)
                self.pixels.show()
            
            # Analog matches the chaos color
            self.set_analog_color(r_chaos, g_chaos, 0, 1.0)
            
            time.sleep(0.15)

    def _anim_fighting(self, pokemon_type):
        """Pulsating breathe effect (Synchronized)"""
        base_color = TYPE_COLORS.get(pokemon_type, TYPE_COLORS["normal"])

        while self.current_state == "FIGHTING" and self.running:
            t = time.time() * 3
            # Calculate shared pulse factor
            factor = (math.sin(t) + 1) / 2
            factor = 0.2 + (0.8 * factor) # Min 20%, Max 100%

            current_color = (
                int(base_color[0] * factor),
                int(base_color[1] * factor),
                int(base_color[2] * factor)
            )

            # Update NeoPixels
            if self.pixels:
                self.pixels.fill(current_color)
                self.pixels.show()
            
            # Update Analog (Use the same factor)
            self.set_analog_color(base_color[0], base_color[1], base_color[2], factor)

            time.sleep(0.02)

    def _anim_switch(self, old_type, new_type):
        """Pokemon switch wipe effect"""
        c_old = TYPE_COLORS.get(old_type, TYPE_COLORS["normal"])
        c_new = TYPE_COLORS.get(new_type, TYPE_COLORS["normal"])
        center = LED_COUNT // 2

        # 1. Retract (Old Color)
        self.set_analog_color(c_old[0], c_old[1], c_old[2], 0.5)
        
        if self.pixels:
            self.pixels.fill(c_old)
            for i in range(center):
                self.pixels[i] = COLOR_OFF
                self.pixels[LED_COUNT - 1 - i] = COLOR_OFF
                self.pixels.show()
                # Dim analog as pixels retract
                dim_factor = 1.0 - (i / center)
                self.set_analog_color(c_old[0], c_old[1], c_old[2], dim_factor)
                time.sleep(0.06)

        time.sleep(0.1)

        # 2. Expand (New Color)
        if self.pixels:
            for i in range(center):
                self.pixels[center + i] = c_new
                self.pixels[center - 1 - i] = c_new
                self.pixels.show()
                # Brighten analog with new color
                bright_factor = (i / center)
                self.set_analog_color(c_new[0], c_new[1], c_new[2], bright_factor)
                time.sleep(0.1)
        else:
            # Fallback delay if no neopixels
            self.set_analog_color(c_new[0], c_new[1], c_new[2], 1.0)
            time.sleep(1.0)

        # Return to fighting with new type
        self.set_state("FIGHTING", {"type": new_type})

    def _anim_damage(self):
        """Flash effect for damage"""
        # White impact
        if self.pixels:
            self.pixels.fill(COLOR_WHITE)
            self.pixels.show()
        self.set_analog_color(255, 255, 255, 1.0)
        time.sleep(0.1)

        # Red blink (3 times)
        for _ in range(3):
            if self.pixels:
                self.pixels.fill(COLOR_RED)
                self.pixels.show()
            self.set_analog_color(255, 0, 0, 1.0)
            time.sleep(0.1)
            
            if self.pixels:
                self.pixels.fill((50, 0, 0))
                self.pixels.show()
            self.set_analog_color(50, 0, 0, 1.0)
            time.sleep(0.1)

        # Return to fighting
        self.set_state("FIGHTING", {"type": self.last_enemy_type})

    def _anim_levelup(self):
        """Rainbow cycle for level up"""
        j = 0

        def wheel(pos):
            if pos < 85: return (pos * 3, 255 - pos * 3, 0)
            elif pos < 170: pos -= 85; return (255 - pos * 3, 0, pos * 3)
            else: pos -= 170; return (0, pos * 3, 255 - pos * 3)

        while self.current_state == "LEVEL_UP" and self.running:
            # Cycle Analog color based on j
            analog_rgb = wheel((j) & 255)
            self.set_analog_color(analog_rgb[0], analog_rgb[1], analog_rgb[2], 1.0)

            if self.pixels:
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
    class Config: populate_by_name = True

class BattleStartData(BaseModel): pass
class BattleEndData(BaseModel): pass

class EnemyAppearedData(BaseModel):
    pokemon: str
    level: int
    hp: int
    maxHp: int = Field(..., alias="maxHp")
    class Config: populate_by_name = True

class EnemySwitchedData(BaseModel):
    pokemon: str
    level: int
    hp: int
    maxHp: int = Field(..., alias="maxHp")
    class Config: populate_by_name = True

class EnemyHPChangeData(BaseModel):
    pokemon: str
    oldHp: int = Field(..., alias="oldHp")
    newHp: int = Field(..., alias="newHp")
    delta: int
    class Config: populate_by_name = True

class LevelUpData(BaseModel):
    pokemon: str
    oldLevel: int = Field(..., alias="oldLevel")
    newLevel: int = Field(..., alias="newLevel")
    class Config: populate_by_name = True

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
    data: Union[LocationChangeData, BattleStartData, BattleEndData, EnemyAppearedData, EnemySwitchedData, EnemyHPChangeData, LevelUpData, dict]

class PartyPokemon(BaseModel):
    nickname: str
    level: int
    currentHp: int = Field(..., alias="currentHp")
    maxHp: int = Field(..., alias="maxHp")
    class Config: populate_by_name = True

class CurrentState(BaseModel):
    location: Optional[str] = None
    inBattle: bool = Field(..., alias="inBattle")
    money: Optional[int] = None
    badges: Optional[int] = Field(None, alias="badges")
    playtime: int
    party: List[PartyPokemon] = Field(default_factory=list)
    class Config: populate_by_name = True

class GameStatePayload(BaseModel):
    timestamp: datetime
    events: List[GameEvent]
    currentState: CurrentState = Field(..., alias="currentState")
    class Config: populate_by_name = True


# ============================================================================
# Event Handler
# ============================================================================

class EventHandler:
    def __init__(self, led_controller: LedController):
        self.leds = led_controller
        self.current_location = None
        self.current_enemy_type = "normal"

    def handle_location_change(self, data: LocationChangeData, state: CurrentState):
        print(f"📍 Location: {data.from_location} → {data.to}")
        self.current_location = data.to
        if not state.inBattle:
            colors = get_location_colors(data.to)
            self.leds.set_state("WALKING", {"colors": colors})

    def handle_battle_start(self, data: BattleStartData, state: CurrentState):
        print(f"⚔️  Battle started at {state.location}")
        self.leds.set_state("ENCOUNTER")

    def handle_battle_end(self, data: BattleEndData, state: CurrentState):
        print(f"✅ Battle ended")
        if self.current_location:
            colors = get_location_colors(self.current_location)
            self.leds.set_state("WALKING", {"colors": colors})
        else:
            self.leds.set_state("IDLE")

    def handle_enemy_appeared(self, data: EnemyAppearedData, state: CurrentState):
        print(f"👾 Enemy: {data.pokemon} Lv.{data.level} ({data.hp}/{data.maxHp} HP)")
        pokemon_type = get_pokemon_type(data.pokemon)
        self.current_enemy_type = pokemon_type
        self.leds.set_state("FIGHTING", {"type": pokemon_type})

    def handle_enemy_switched(self, data: EnemySwitchedData, state: CurrentState):
        print(f"↻  Enemy switched to: {data.pokemon} Lv.{data.level}")
        old_type = self.current_enemy_type
        new_type = get_pokemon_type(data.pokemon)
        self.current_enemy_type = new_type
        self.leds.set_state("SWITCH", {"old": old_type, "new": new_type})

    def handle_enemy_hp_change(self, data: EnemyHPChangeData, state: CurrentState):
        delta_str = f"+{data.delta}" if data.delta > 0 else str(data.delta)
        print(f"❤️  {data.pokemon} HP: {data.oldHp} → {data.newHp} ({delta_str})")
        if data.delta < 0:
            self.leds.set_state("DAMAGE", {"type": self.current_enemy_type})

    def handle_level_up(self, data: LevelUpData, state: CurrentState):
        level_gain = data.newLevel - data.oldLevel
        print(f"🆙 {data.pokemon} leveled up! Lv.{data.oldLevel} → Lv.{data.newLevel} (+{level_gain})")
        self.leds.set_state("LEVEL_UP")

    def process_events(self, payload: GameStatePayload):
        if not payload.events: return
        print(f"\n{'='*60}")
        print(f"📦 {len(payload.events)} event(s) at {payload.timestamp}")
        print(f"📍 {payload.currentState.location} | Battle: {payload.currentState.inBattle}")
        
        # Determine priority event (e.g. battle start overrides hp change)
        # For simplicity, we process in order, knowing logic handles state transitions
        for event in payload.events:
            if event.type == EventType.LOCATION_CHANGE: self.handle_location_change(event.data, payload.currentState)
            elif event.type == EventType.BATTLE_START: self.handle_battle_start(event.data, payload.currentState)
            elif event.type == EventType.BATTLE_END: self.handle_battle_end(event.data, payload.currentState)
            elif event.type == EventType.ENEMY_APPEARED: self.handle_enemy_appeared(event.data, payload.currentState)
            elif event.type == EventType.ENEMY_SWITCHED: self.handle_enemy_switched(event.data, payload.currentState)
            elif event.type == EventType.ENEMY_HP_CHANGE: self.handle_enemy_hp_change(event.data, payload.currentState)
            elif event.type == EventType.LEVEL_UP: self.handle_level_up(event.data, payload.currentState)


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(title="Pokemon GS Server (Dual LED)", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

led_controller = LedController()
event_handler = EventHandler(led_controller)

@app.post("/gamestate")
async def receive_game_state(payload: GameStatePayload):
    try:
        event_handler.process_events(payload)
        return JSONResponse(status_code=200, content={"status": "ok"})
    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {
        "status": "online",
        "hardware": HARDWARE_STATUS,
        "analog_pins": {"R": PIN_RED, "G": PIN_GREEN, "B": PIN_BLUE},
        "version": "2.1.0"
    }

@app.on_event("shutdown")
async def shutdown_event():
    led_controller.stop()

if __name__ == "__main__":
    print(f"""
    ╔════════════════════════════════════════════════════════════════════╗
    ║  Pokemon Fire Red Server with DUAL LED Control                     ║
    ║                                                                    ║
    ║  🌈 NeoPixel (RGBIC): GPIO 10 (SPI) | Status: {HARDWARE_STATUS['neopixel']!s:<5}            ║
    ║  💡 Analog RGB: GPIO 16, 20, 21     | Status: {HARDWARE_STATUS['analog']!s:<5}            ║
    ╚════════════════════════════════════════════════════════════════════╝
    """)
    uvicorn.run(app, host="127.0.0.1", port=3333, log_level="error")