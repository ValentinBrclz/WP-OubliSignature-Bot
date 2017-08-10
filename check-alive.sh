#!/usr/bin/env bash
# Check if bot is alive
if job signature-manquante > /dev/null
then
	# Run the bot
	(>&2 echo "'signature-manquante' job is not alive anymore. Launching bot again.")
	~/WP-OubliSignature-Bot/run.sh
fi
