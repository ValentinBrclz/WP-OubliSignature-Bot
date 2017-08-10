#!/usr/bin/env bash
# Check if bot is alive
if job signature-manquante > /dev/null
then
	# Run the bot
   ./run.sh
fi
