#!/bin/bash
#
# GPIO Permissions Setup for NeoPixel LED Control
#
# This script configures GPIO permissions so the gamestate server can run
# without requiring root/sudo access. This is the recommended approach for
# production deployments.
#
# What this script does:
# 1. Adds current user to 'gpio' group for GPIO access
# 2. Creates udev rules for /dev/mem and GPIO access
# 3. Configures PWM permissions for NeoPixel control
#
# Usage:
#   chmod +x setup_gpio_permissions.sh
#   ./setup_gpio_permissions.sh
#
# After running, you MUST log out and log back in (or reboot) for changes to take effect.
#

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  GPIO Permissions Setup for NeoPixel LED Control           ║"
echo "║                                                            ║"
echo "║  This will configure your system to allow LED control     ║"
echo "║  without requiring root/sudo privileges.                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if running on Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null && ! [ -d /sys/class/gpio ]; then
    echo "⚠️  Warning: This doesn't appear to be a Raspberry Pi."
    echo "   GPIO setup may not work correctly."
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Must run as root to modify system config
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run with sudo:"
    echo "   sudo ./setup_gpio_permissions.sh"
    exit 1
fi

# Get the actual user (not root when using sudo)
ACTUAL_USER="${SUDO_USER:-$USER}"
echo "👤 Configuring permissions for user: $ACTUAL_USER"
echo ""

# Step 1: Add user to gpio group
echo "📝 Step 1/4: Adding user to 'gpio' group..."
if getent group gpio > /dev/null 2>&1; then
    usermod -a -G gpio "$ACTUAL_USER"
    echo "   ✅ User added to gpio group"
else
    echo "   ⚠️  gpio group doesn't exist, creating it..."
    groupadd gpio
    usermod -a -G gpio "$ACTUAL_USER"
    echo "   ✅ gpio group created and user added"
fi

# Step 2: Create udev rules for GPIO access
echo ""
echo "📝 Step 2/4: Creating udev rules for GPIO access..."

UDEV_FILE="/etc/udev/rules.d/99-gpio.rules"
cat > "$UDEV_FILE" << 'EOF'
# GPIO Access Rules for NeoPixel LED Control
# Allows members of 'gpio' group to access GPIO without root

# GPIO sysfs
SUBSYSTEM=="gpio", GROUP="gpio", MODE="0660"

# GPIO character device
SUBSYSTEM=="gpio", KERNEL=="gpiochip*", GROUP="gpio", MODE="0660"

# SPI (used by some NeoPixel libraries)
SUBSYSTEM=="spidev", GROUP="gpio", MODE="0660"

# PWM (used by WS281x)
SUBSYSTEM=="pwm", GROUP="gpio", MODE="0660"
EOF

echo "   ✅ udev rules created: $UDEV_FILE"

# Step 3: Create udev rules for /dev/mem access (required by rpi_ws281x)
echo ""
echo "📝 Step 3/4: Creating /dev/mem access rules..."

MEM_UDEV_FILE="/etc/udev/rules.d/99-mem.rules"
cat > "$MEM_UDEV_FILE" << 'EOF'
# /dev/mem access for NeoPixel control via rpi_ws281x
# WARNING: This grants hardware memory access to gpio group
# Only use on dedicated/trusted systems

KERNEL=="mem", GROUP="gpio", MODE="0660"
EOF

echo "   ✅ /dev/mem rules created: $MEM_UDEV_FILE"
echo "   ⚠️  Note: /dev/mem access is a security consideration"
echo "      Only use this on dedicated systems for LED control"

# Step 4: Reload udev rules
echo ""
echo "📝 Step 4/4: Reloading udev rules..."
udevadm control --reload-rules
udevadm trigger
echo "   ✅ udev rules reloaded"

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ GPIO Permissions Setup Complete                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "⚠️  IMPORTANT: You must LOG OUT and LOG BACK IN (or reboot)"
echo "   for group membership changes to take effect!"
echo ""
echo "After logging back in, verify with:"
echo "   groups | grep gpio"
echo ""
echo "Then test the server:"
echo "   python gamestate_server_with_leds.py"
echo ""

# Show current groups for verification after reboot
echo "Current groups for $ACTUAL_USER:"
groups "$ACTUAL_USER"
echo ""
echo "After logging back in, the 'gpio' group should appear."
