# Pokemon Fire Red LED Game State Server

Real-time LED animations synchronized with Pokemon Fire Red gameplay using NeoPixel LED strips.

## 🎮 Features

- **Location-based ambient lighting**: Different color schemes for routes, cities, dungeons
- **Battle effects**: Strobe encounter animation, type-based pulsing during battle
- **Pokemon type colors**: LEDs match the active enemy Pokemon's type
- **Battle events**: Damage flashes, switch animations, level-up rainbow
- **Non-intrusive**: Works with existing game state server, zero game performance impact

## 📋 Hardware Requirements

### Required
- **Raspberry Pi** (any model with GPIO, tested on Pi 4)
- **WS2811/WS2812/WS2812B NeoPixel LED Strip**
  - 50 LEDs recommended (configurable in code)
  - 5V power supply (separate from Pi for 50+ LEDs)
  - Connects to GPIO Pin 10 (PWM, configurable)

### Optional
- Level shifter (3.3V to 5V) for reliable data signal
- 470Ω resistor between Pi and LED data line
- 1000µF capacitor across LED power supply

## 🔧 Software Installation

### 1. Install Python Dependencies

```bash
# Install FastAPI and server dependencies
pip3 install fastapi uvicorn pydantic

# Install LED control libraries (Raspberry Pi only)
pip3 install adafruit-blinka adafruit-circuitpython-neopixel rpi_ws281x --break-system-packages
```

**Note**: The `--break-system-packages` flag is needed on newer Raspberry Pi OS versions.

### 2. Fix GPIO Permissions (NO MORE ROOT REQUIRED!)

The LED library needs GPIO access which normally requires root. Use our setup script to fix this:

```bash
# Run the setup script (requires sudo)
sudo ./setup_gpio_permissions.sh

# LOG OUT and LOG BACK IN (or reboot)
# This is REQUIRED for group membership changes to take effect

# Verify gpio group membership
groups | grep gpio
```

**What the script does:**
- Adds your user to the `gpio` group
- Creates udev rules for GPIO/PWM/SPI access
- Grants `/dev/mem` permissions (needed by rpi_ws281x)
- No more `sudo` needed to run the server!

**Security Note**: The setup grants hardware memory access to the `gpio` group. Only use this on dedicated/trusted systems.

### 3. Frontend Configuration

**No configuration needed!** The frontend auto-detects the gamestate server at startup.

**How it works:**
- When the emulator initializes, it pings `http://localhost:3333/health`
- If the server responds within 2 seconds → LED integration enabled
- If the server doesn't respond → LED integration disabled (silent)

**To use:**
1. Start the gamestate server first: `python gamestate_server_with_leds.py`
2. Start your frontend (dev or production)
3. Play the game - LEDs will react to game events automatically!

**Verification:**
- Check browser console (F12) for: `🌐 Game State Server: DETECTED at localhost:3333`
- If not detected: `🌐 Game State Server: Not detected (localhost:3333)`

## 🚀 Running the Server

### Standard Mode (with LED hardware)

```bash
python gamestate_server_with_leds.py
```

The server will:
- ✅ Initialize LED strip (50 pixels on GPIO D10)
- 🌐 Listen on `http://127.0.0.1:3333`
- 🎨 Control LEDs based on game events
- 📚 Provide API docs at `http://localhost:3333/docs`

### Mock Mode (without LED hardware)

The server automatically detects if LED hardware is unavailable and runs in **mock mode**:

```bash
# On non-Pi systems or without LEDs connected
python gamestate_server_with_leds.py

# Output:
# ⚠️  LED hardware not available: [Errno 2] No such file or directory
#    Server will run without LED control
```

This allows you to:
- Test the server on development machines
- Debug event handling without hardware
- Run on non-Raspberry Pi systems

## 🎨 LED Animation States

### Walking/Exploring
- **Trigger**: `location_change` event
- **Effect**: Smooth sine-wave animation with 3 location-specific colors
- **Examples**:
  - Pallet Town: Green grass, white fences, dirt path
  - Lavender Town: Spooky purple, dark violet, mist
  - Route 19: Deep blue, light blue, white foam

### Encounter
- **Trigger**: `battle_start` event
- **Effect**: Chaotic white/red strobe (like wild Pokemon encounter flash)
- **Duration**: Until enemy Pokemon appears

### Fighting
- **Trigger**: `enemy_appeared` event
- **Effect**: Pulsating breathe effect in Pokemon's type color
- **Type Colors**:
  - Fire: Orange (240, 128, 48)
  - Water: Blue (104, 144, 240)
  - Electric: Yellow (248, 208, 48)
  - Grass: Green (120, 200, 80)
  - ...and 13 more types

### Damage
- **Trigger**: `enemy_hp_change` event (negative delta)
- **Effect**: White flash → Red blinks → Return to fighting
- **Duration**: ~0.7 seconds

### Switch
- **Trigger**: `enemy_switched` event
- **Effect**: Retract old color → Pause → Expand new color
- **Duration**: ~2 seconds
- **Then**: Returns to fighting with new Pokemon type

### Level Up
- **Trigger**: `level_up` event
- **Effect**: Rainbow cycle animation
- **Duration**: Continuous until battle ends or new event

### Idle
- **Trigger**: No active game state
- **Effect**: LEDs off

## 🔌 Hardware Wiring

### Basic Wiring (50 LEDs or less)

```
Raspberry Pi          NeoPixel Strip
───────────────       ──────────────
GPIO 10 (Pin 19) ──── DIN (Data In)
Ground (Pin 6)   ──── GND
                      +5V ──── External 5V Power Supply (2A+)
```

### Recommended Wiring (with protection)

```
Pi GPIO 10 ──[470Ω]──> DIN
Pi GND ───────────────> GND
5V PSU ───────────────> +5V
5V PSU ──[1000µF]───> GND (capacitor across power)
```

**Power Requirements**:
- Each LED draws ~60mA at full white
- 50 LEDs at full brightness = 3A
- Use external power supply, NOT the Pi's 5V pin

## ⚙️ Configuration

### Frontend Configuration

**No configuration needed** - The frontend auto-detects the gamestate server at startup (see "Frontend Configuration" section above).

### LED Hardware Configuration

Edit `gamestate_server_with_leds.py`:

```python
# LED Configuration (lines 38-42)
LED_COUNT = 50              # Number of LEDs in your strip
LED_BRIGHTNESS = 1.0        # 0.0 to 1.0 (reduce for less power draw)
LED_ORDER_GRB = True        # Set to False if colors are wrong (try RGB)

# GPIO Pin (line 45)
LED_PIN = board.D10         # GPIO 10 (PWM channel)
                            # Alternatives: board.D12 (GPIO 12), board.D18 (GPIO 18)
```

**Supported PWM Pins** (for WS281x):
- GPIO 10 (Pin 19) - PWM0 - **Recommended**
- GPIO 12 (Pin 32) - PWM0
- GPIO 18 (Pin 12) - PWM0
- GPIO 21 (Pin 40) - PWM1

## 📊 Event Mapping

| Game Event | LED Animation | Duration |
|------------|---------------|----------|
| `location_change` | Walking (location colors) | Continuous |
| `battle_start` | Encounter strobe | Until enemy appears |
| `enemy_appeared` | Fighting (type color pulse) | Continuous |
| `enemy_switched` | Switch wipe effect | 2s → Fighting |
| `enemy_hp_change` (damage) | Damage flash | 0.7s → Fighting |
| `level_up` | Rainbow cycle | Continuous |
| `battle_end` | Return to walking | Continuous |

## 🧪 Testing

### Test LED Control Manually

```python
from gamestate_server_with_leds import LedController, get_location_colors

# Create controller
leds = LedController()

# Test walking animation
colors = get_location_colors("Viridian Forest")
leds.set_state("WALKING", {"colors": colors})

# Test battle animations
leds.set_state("ENCOUNTER")  # Strobe
time.sleep(2)

leds.set_state("FIGHTING", {"type": "fire"})  # Red pulse
time.sleep(5)

leds.set_state("DAMAGE")  # Flash
time.sleep(2)

leds.set_state("LEVEL_UP")  # Rainbow
```

### Test with Game

1. Start the server: `python gamestate_server_with_leds.py`
2. Start frontend: `npm run frontend:dev`
3. Play the game:
   - Walk around → See location colors
   - Enter battle → See encounter strobe
   - Attack enemy → See damage flash
   - Level up → See rainbow

## 🐛 Troubleshooting

### "LED hardware not available"
- **Cause**: Not running on Raspberry Pi or libraries not installed
- **Solution**: Install libraries or server runs in mock mode (events still logged)

### "Permission denied" or "Must be run as root"
- **Cause**: GPIO permissions not configured
- **Solution**: Run `sudo ./setup_gpio_permissions.sh` and **log out/reboot**

### Wrong colors (red shows as green, etc.)
- **Cause**: LED strip uses different color order
- **Solution**: Change `LED_ORDER_GRB = False` in config (try RGB instead)

### LEDs flicker or show random colors
- **Cause**: Insufficient power or missing capacitor
- **Solution**: Use external 5V power supply, add 1000µF capacitor

### Only first few LEDs light up
- **Cause**: Insufficient power for all LEDs
- **Solution**: Reduce `LED_BRIGHTNESS` or use higher amperage power supply

### No LEDs at wrong GPIO pin
- **Cause**: Non-PWM pin or wrong pin configured
- **Solution**: Use GPIO 10, 12, 18, or 21 (PWM-capable pins only)

## 📁 Files

- `gamestate_server_with_leds.py` - Main server with LED integration
- `setup_gpio_permissions.sh` - GPIO permission setup script
- `new animations.py` - Original standalone LED animation code (reference)
- `gamestate_server.py` - Basic server without LEDs

## 🎯 Adding More Locations/Pokemon

### Add New Location Colors

Edit `LOCATION_COLORS` dictionary (lines 140-188):

```python
LOCATION_COLORS = {
    "new location": [(R, G, B), (R, G, B), (R, G, B)],  # Primary, Secondary, Accent
    # ... existing entries
}
```

### Add Pokemon Type Mappings

Edit `POKEMON_TYPES` dictionary (lines 44-134):

```python
POKEMON_TYPES = {
    "newpokemon": "fire",  # Lowercase name to type
    # ... existing entries
}
```

## 📝 License & Credits

- **NeoPixel Library**: Adafruit Industries
- **rpi_ws281x**: Jeremy Garff
- **Game**: Pokemon Fire Red (Nintendo/Game Freak)
- **Project**: 10 Minute Pokemon collaborative experience

## 🔗 Related Documentation

- [NeoPixel Überguide](https://learn.adafruit.com/adafruit-neopixel-uberguide)
- [rpi_ws281x Library](https://github.com/jgarff/rpi_ws281x)
- [Raspberry Pi GPIO](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#gpio-and-the-40-pin-header)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
