#!/usr/bin/env bash
# Get the last version
git pull

# Install any new package
npm install

# Start with forever
./node_modules/.bin/forever start lib/bot.js
