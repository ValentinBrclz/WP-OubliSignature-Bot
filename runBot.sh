#!/usr/bin/env bash
# Stop the bot
./node_modules/.bin/forever stopall

# Get the last version
git pull

# Install any new package
npm install

# Start with forever
./node_modules/.bin/forever start -c /shared/bin/node -o ~/logs/oublisignature-out.log -e ~/logs/oublisignature-err.log lib/bot.js
