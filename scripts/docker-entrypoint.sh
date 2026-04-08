#!/bin/sh
set -e

# Start the GUI server in the background
node scripts/nutbits-gui-server.js &

# Start the backend (foreground — Docker watches this process)
exec node nutbits.js
