/*
 * WP-OubliSignature-Bot
 *
 * Wikipedia FR Bot that signs when users forget to do so
 * Copyright (C) 2015 Valentin Berclaz
 * <http://www.valentinberclaz.com/>
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; version 2 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */
'use strict';

/////////////////////////
/// Vars
var WikimediaStream = require('wikimedia-stream'),
	ws = new WikimediaStream(),
	bot = require('nodemw'),
	client = new bot('lib/config.json'),
	async = require('async'),
	differ = require('diff'),
	escapeStringRegexp = require('escape-string-regexp'),
	Html5Entities = require('html-entities').Html5Entities,
	list_optin,	list_optout;

/////////////////////////
/// MAIN
try {
	// Create user DB
	updateUserDB();

	// Read stream
	//noinspection JSUnresolvedFunction
	ws.on("data", function (data) {
		handleData(data);
	});
}
catch(err)
{
	console.err(err);
}

/////////////////////////
/// FUNCTIONS
/**
 * Get the data and handle all the steps for processing it
 * @param data object: the data received via the stream
 */
function handleData (data) {
	// Check if page is elligible (async)
	isDiscussion(data.page, function(err, isDiscussion) {
		if(isDiscussion) {
			// Check if user is elligible
			isUserElligible(data.user, data.flags, function(err, isUserElligible) {
				if (isUserElligible) {
					console.log("[["+data.page+"]] by "+data.user);
					// Get the diff
					getAddedLinesFromUrl(data.url, data.page, function (err, content, added_lines) {
						if (err) {
							console.log(err);
							return;
						}

						if (added_lines !== null) {
							async.each(added_lines, function (line, callback) {
								// Don't bother testing if it is just a small array
								if (line.length > 5) {
									if (isUnsignedComment(line, data.user, content)) {
										// TODO NotifyUser (beta) (check category first)
										// TODO {{non signe}}
										addLogLine(data.page, data.url, data.user);
										console.log("UNSIGNED : "+data.url)
									}
									console.log("-------------------------------------------------");
									callback();
								}
							});
						}
					});
				}
			});
		}
	});
}

/////////////////////////
/// UPDATE FUNCTIONS
/**
 * Update the user database
 */
function updateUserDB() {
	// TODO handle async tasks
	var tmp,
		regex = /^Utilisateur:([^\/]+)(\/.+)?/i;
	list_optin = [];
	list_optout = [];
	client.getPagesInCategory("Utilisateur avec contrôle de signature", function(err, data) {
		for(var i = 0; i < data.length; i++)
		{
			tmp = data[i].title;
			if(tmp.indexOf("Utilisateur:") > -1)
			{
				list_optin.push(tmp.replace(regex, "$1"));
			}
		}
	});
	client.getPagesInCategory("Utilisateur sans contrôle de signature", function(err, data) {
		for(var i = 0; i < data.length; i++)
		{
			tmp = data[i].title;
			if(tmp.indexOf("Utilisateur:") > -1)
			{
				list_optout.push(tmp.replace(regex, "$1"));
			}
		}
	});
}

/**
 * Check if a user is autopatrolled
 * @param username String: The username
 * @param callback function
 */
function isAutopatrolled(username, callback) {
	var params = {
		action: 'query',
		list: 'users',
		usprop: 'groups',
		ususers: username
	};

	client.api.call(params, function (err, info, next, returned) {
		if(info !== undefined && info.users !== undefined && info.users[0].groups !== undefined) {
			if(info.users[0].groups.indexOf("autopatrolled") > -1) {
				callback(null, false); // for testing purpose TODO
			}
			else
				callback(null, false);
		}
	});
}
/////////////////////////
/// TRANSFORMATION FUNCTIONS
/**
 * Extract the content and the added lines from a diff and oldid or only oldid url
 * @param url String: the url with the oldid
 * @param page String: the page
 * @param callback function(err, content, added_lines[])
 */
function getAddedLinesFromUrl(url, page, callback) {
	var params,
		oldid = url.match(/oldid=([1-9][0-9]+)/),
		diff = url.match(/diff=([1-9][0-9]+)/);

	params = {
		action: 'query',
		prop: 'revisions',
		rvprop: 'content',
		rvlimit: 1,
		rvdir: 'newer',
		rvstartid: oldid,
		titles: page
	};

	// If is not a page creation
	if(diff !== null)
	{
		params.rvlimit = 2;
		params.rvendid = diff;
	}

	client.api.call(params, function (err, info, next, returned) {
		if (info.pages[Object.keys(info.pages)[0]].revisions !== undefined) {
			var oldrv = info.pages[Object.keys(info.pages)[0]].revisions[0]['*'];

			if(info.pages[Object.keys(info.pages)[0]].revisions[1] !== undefined) {
				var newrv = info.pages[Object.keys(info.pages)[0]].revisions[1]['*'];
				callback(null, newrv, getAddedLines(oldrv, newrv));
			}
			else {
				callback(null, oldrv, [ oldrv ]);
			}
		}
		else
			callback(new Error("The page (" + url + ") couldn't be loaded."));
	});
}

/**
 * Gives only the added lines back
 * @param oldrv String: The old revision content
 * @param newrv String: The new revision content
 * @return Array: The added lines
 */
function getAddedLines(oldrv, newrv) {
	var diff_raw = differ.diffChars(oldrv, newrv),
		diff = '',
		begintag = '<<BEGINSIGNADDED>>',
		endtag = '<<ENDSIGNADDED>>',
		join_regex = new RegExp(endtag+"(\\s*)"+begintag, "g"),
		match_regex = new RegExp("(^"+begintag+"|"+begintag+"\n+^)([\\s\\S]+?)?"+endtag,"gm"),
		clean_regex = new RegExp(begintag+"([\\s\\S]+)"+endtag, "g");

	// Compose diff entirely (need the context)
	diff_raw.forEach(function(part) {
		if(part.added)
			diff += begintag+part.value+endtag;
		else
			diff += part.value;
	});

	// Join following tags
	diff = diff.replace(join_regex, "$1");

	// Extract only new lines depending of the context
	var matches = diff.match(match_regex);
	if(matches === null)
		return null;
	else
	{
		return matches.replaceArray(clean_regex,"$1");
	}
}

/////////////////////////
/// ACTION FUNCTIONS
/**
 * Add a line on the log page
 * @param page String: the page to log
 * @param url String: the diff url
 * @param user String: the user that did the action
 */
function addLogLine(page, url, user) {
	client.logIn(function (err) {
		if (err) {
			console.log(err);
			return;
		}
		client.getArticle("Utilisateur:Signature Manquante (bot)/Journal", function (err, content) {
			if (err) {
				console.error(err);
				return;
			}

			var date = new Date(),
				newcontent = content + "\n* " + date.toUTCString() + " ([" + url + " diff]) [[" + page + "]] from {{u|" + user +"}}";

			client.edit("Utilisateur:Signature Manquante (bot)/Journal", newcontent, "Ajout d'une ligne", function (err, data) {
				if (err) {
					console.error(err);
				}
			});
		});
	});
}

/**
 * Add a message to the discussion page of a user
 * @param page String: the page to log
 * @param line String: the problematic line
 * @param user String: the user that did the action
 */
function addMsgOnUserPage(page, line, user) {
	client.logIn(function (err) {
		if (err) {
			console.log(err);
			return;
		}
		client.getArticle("Discussion utilisateur:"+Html5Entities.decode(user), function (err, content) {
			if (err) {
				console.error(err);
				return;
			}

			var newcontent = content + "\n + {{subst:User:Signature Manquante (bot)/Modèle:BetaAideMoi|"+page+"|2=<nowiki>"+line+"</nowiki>}}\n";

			client.edit(
				"Discussion utilisateur:"+Html5Entities.decode(user),
				newcontent,
				"[[Aide:Signature/résumé|Signature manquante]] sur "+page+" (beta)",
				function (err, data) {
					if (err) {
						console.error(err);
					}
			});
		});
	});
}

/////////////////////////
/// TEST FUNCTIONS (boolean return)
/**
 * Test if title is a discussion page
 * @param title String: the title of the page
 * @param callback
 */
function isDiscussion (title, callback) {
	// Discussion page
	if (title.indexOf("Discussion") === 0 && title.indexOf("À faire") === -1)
	{
		callback(null, true);
	}
	// Meta page
	else if (title.indexOf("Wikipédia:") === 0) {
		isMetaDiscussion(title, function(err, value) {
			callback(err, value);
		});
	}
	// Not a Discussion page
	else
		callback(null, false);
}

/**
 * Test if the meta page is a discussion area
 * @param title String: the title of the page
 * @param callback err, boolean
 */
function isMetaDiscussion (title, callback) {
	var params = {
		action: 'parse',
		page: title,
		prop: 'properties'
	};

	client.api.call(params, function (err, info, next, returned) {
		if(info !== undefined && info.properties !== undefined) {
			for(var i = 0; i < info.properties.length; i++)	{
				if (info.properties[i].name !== undefined && info.properties[i].name == "newsectionlink")
					callback(null, true);
			}
			callback(null, false);
		}
	});
}

/**
 * Tets if the user with username is elligible for a correction
 * @param username String: the username to check
 * @param flags String: the flags of the edit
 * @param callback
 */
function isUserElligible (username, flags, callback) {
	// Not a bot edit
	if(flags !== undefined && flags.indexOf("B") > -1) {
		callback(null, false);
		return;
	}

	// Update DB (by chance)
	if(Math.floor(Math.random() * 10)+1 == 2)
		updateUserDB();

	// Opt-in
	if(list_optin !== undefined && list_optin.indexOf(username) != -1) {
		callback(null, true);
		return;
	}

	// Opt-out
	if(list_optout !== undefined && list_optout.indexOf(username) != -1) {
		callback(null, false);
		return;
	}

	// Autopatolled
	isAutopatrolled(username, function(err, result) {
		callback(err, !result);
	});
}

/**
 * Check if a line is an unsigned comment
 * @param line String: The line to check
 * @param user String: The user that did the action
 * @param content String: The content (context)
 * @return Boolean
 */
function isUnsignedComment(line, user, content) {
	// Test if the line is complete
	var regex = new RegExp(escapeStringRegexp(line.trim())+"$","m");
	if(!regex.test(content))
		return false;

	// List of regexes
	var regexes = [
		new RegExp("{{\\s*(si|suppression immédiate|speedy|sd|dsi|delete|db|page conservée|avertissement homonymie|traduit de|wikiprojet|ip scolaire|ip partagée|icône|arbre|wikipédia n'est pas un forum|Wikidata|boite|boîte)", "i"), // modèles
		new RegExp("\\[\\[Catégorie:","i"), // Catégorie
		new RegExp("^\\s*{?[\\|!]"), // Paramètre de modèle ou tableau
		new RegExp("{\\|"), // Tableau
		new RegExp("^\\s+$"), // Seulement du vide
		new RegExp("^\\s*(==*).+\\1\\s*$"), // Seulement un titre
		new RegExp("^\\s*__TOC__\\s*$"), // TOC only
		new RegExp("\\[\\[(Utilisateur|User|Spécial:Contributions/|Discussion Utilisateur):" + escapeStringRegexp(Html5Entities.decode(user)), "i") // Non-signé
	];

	// Test each regex - if regex is valid: that's it
	console.log(line);
	for(var i = 0; i < regexes.length; i++) {
		console.log("- '"+regexes[i]+"' -> "+regexes[i].test(line));
		if(regexes[i].test(line))
			return false;
	}

	return true;
}

////////////////////////////////
/// PROTOTYPE FUNCTIONS
/**
 * Execute a regex on an entier array
 * @param find RegExp: regex to find
 * @param replace String: replacement
 * @returns {Array}: the array with the new values
 */
Array.prototype.replaceArray = function(find, replace) {
	var replaceArray = this;
	for (var i = 0; i < replaceArray.length; i++) {
		replaceArray[i] = replaceArray[i].replace(find, replace);
	}
	return replaceArray;
};
