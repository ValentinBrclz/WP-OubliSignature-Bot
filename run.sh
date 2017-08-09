#!/usr/bin/env bash
# Stop the bot
jstop signature-manquante

# Get the last version
git pull

# Install any new package
npm install --production

# Wait 10 seconds for process to finalise
echo "Waiting for previous job to finish..."
sleep 10

# Start with forever
jstart -mem 2g -N signature-manquante -cwd /shared/bin/node  lib/bot.js
