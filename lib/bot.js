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
	ws = new WikimediaStream({}),
	bot = require('nodemw'),
	client = new bot('lib/config.json'),
	async = require('async'),
	diffMaker = require('diff'),
	escapeStringRegexp = require('escape-string-regexp'),
	Html5Entities = require('html-entities').Html5Entities,
	list_optin, list_optout;

/////////////////////////
/// MAIN
try {
	// Create user DB
	updateUserDB();

	// Read stream
	ws.on("data", function (data) {
		handleData(data);
	});

	ws.on("error", function (err) {
		console.log('Error', err);
	});
}
catch (err) {
	console.err(err);
}

/////////////////////////
/// FUNCTIONS
/**
 * Get the data and handle all the steps for processing it
 * @param data object: the data received via the stream
 */
function handleData(data) {

	// Check if page is elligible (async)
	isDiscussion(data.page, function (err, isDiscussion) {
		if (err) {
			console.log(err);
			return;
		}

		if (isDiscussion) {
			// Check if user is elligible
			isUserElligible(data.user, data.flags, function (err, isUserElligible) {
				if (err) {
					console.log(err);
					return;
				}

				if (isUserElligible) {
					console.log("[[" + data.page + "]] by " + data.user);

					// Get the diff
					getAddedLinesFromUrl(data.url, data.page, function (err, content, added_lines) {
						if (err) {
							console.log(err);
							return;
						}

						if (added_lines !== null) {
							async.each(added_lines, function (line, callback) {
								var trimmedline = line.trim(); // Remove whitspaces
								// Don't bother testing if it is just a small array
								if (line.length > 5) {
									if (isUnsignedComment(trimmedline, data.page, data.comment, data.user, content)) {
										console.log("UNSIGNED : " + data.url);

										client.logIn(function (err) {
											if (err) {
												console.log(err);
												return;
											}

											// Execute these actions
											addLogLine(data.page, data.url, data.user);
											var id = getDiffFromUrl(data.url);
											if (id === null)
												id = getOldidFromUrl(data.url);
											signLine(data.page, trimmedline, id, data.user);
											addMsgOnUserPage(data.user, data.page, data.url);
										});
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
 * @param callback
 */
function updateUserDB(callback) {
	// TODO handle async tasks
	var tmp;
	list_optin = [];
	list_optout = [];
	client.getPagesInCategory("Utilisateur avec contrôle de signature", function (err, data) {
		for (var i = 0; i < data.length; i++) {
			tmp = data[i].title;
			if (tmp.indexOf("Utilisateur:") > -1) {
				list_optin.push(tmp.replace("Utilisateur:", ""));
			}
		}
	});
	client.getPagesInCategory("Utilisateur sans contrôle de signature", function (err, data) {
		for (var i = 0; i < data.length; i++) {
			tmp = data[i].title;
			if (tmp.indexOf("Utilisateur:") > -1) {
				list_optout.push(tmp.replace("Utilisateur:", ""));
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

	client.api.call(params, function (err, info) {
		if (info !== undefined && info.users !== undefined && info.users[0].groups !== undefined) {
			if (info.users[0].groups.indexOf("autopatrolled") > -1) {
				callback(null, true);
			}
			else
				callback(null, false);
		}
		else
			callback(null, false); // IP or invalid user
	});
}

/**
 * Check if a specific page allows the bot intervention
 * @param title String: The title of the page
 * @param callback function
 */
function isBotAllowed(title, callback) {
	client.getArticle(title, function (err, content) {
		if (err) {
			callback(err);
			return;
		}

		callback(null, isBotAllowedInContent(content));
	});
}

/**
 * Check if the content allows the bot to edit
 * @param content String: The content to test
 */
function isBotAllowedInContent(content) {
	return !(content.indexOf("{{nobots}}") != -1 || /\{\{bots\|deny=(all|[^}]*Signature Manquante \(bot\))[^}]*}}/.test(content));
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
		oldid = getOldidFromUrl(url),
		diff = getDiffFromUrl(url);

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
	if (diff !== null) {
		params.rvlimit = 2;
		params.rvendid = diff;
	}

	client.api.call(params, function (err, info) {
		if (info && info.pages[Object.keys(info.pages)[0]].revisions !== undefined) {
			var oldrv = info.pages[Object.keys(info.pages)[0]].revisions[0]['*'];

			if (info.pages[Object.keys(info.pages)[0]].revisions[1] !== undefined) {
				var newrv = info.pages[Object.keys(info.pages)[0]].revisions[1]['*'];
				callback(null, newrv, getAddedLines(oldrv, newrv));
			}
			else {
				callback(null, oldrv, [oldrv]);
			}
		}
		else
			callback(new Error("The page (" + url + ") couldn't be loaded."));
	});
}

/**
 * Get an oldid from a specific url
 * @param url String: the url to parse
 * @return String
 */
function getOldidFromUrl(url) {
	var match = url.match(/oldid=([1-9][0-9]+)/);
	return match[1];
}

/**
 * Get a diff id from a specific url
 * @param url String: the url to parse
 * @return String|null
 */
function getDiffFromUrl(url) {
	var match = url.match(/diff=([1-9][0-9]+)/);
	if (match === null)
		return null;
	return match[1];
}

/**
 * Gives only the added lines back
 * @param oldrv String: The old revision content
 * @param newrv String: The new revision content
 * @return Array: The added lines
 */
function getAddedLines(oldrv, newrv) {
	var diff_raw = diffMaker.diffChars(oldrv, newrv),
		diff = '',
		begintag = '<<BEGINSIGNADDED>>',
		endtag = '<<ENDSIGNADDED>>',
		join_regex = new RegExp(endtag + "(\\s*)" + begintag, "g"),
		match_regex = new RegExp("(^" + begintag + "|" + begintag + "\n+^)([\\s\\S]+?)?" + endtag, "gm"),
		clean_regex = new RegExp(begintag + "([\\s\\S]+)" + endtag, "g");

	// Compose diff entirely (need the context)
	diff_raw.forEach(function (part) {
		if (part.added)
			diff += begintag + part.value + endtag;
		else
			diff += part.value;
	});

	// Join following tags
	diff = diff.replace(join_regex, "$1");

	// Extract only new lines depending of the context
	var matches = diff.match(match_regex);
	if (matches === null)
		return null;
	else {
		return matches.replaceArray(clean_regex, "$1");
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
	client.getArticle("Utilisateur:Signature Manquante (bot)/Journal", function (err, content) {
		if (err) {
			console.error(err);
			return;
		}

		var row = " |----\n | [" + url + " ~~~~~]  || [[" + page + "]]  || {{u|" + user + "}} || {{rouge|'''signé & prévenu'''}} || ?\n |}",
			newcontent = content.replace(" |}", row);

		client.edit("Utilisateur:Signature Manquante (bot)/Journal", newcontent, "Ajout d'une ligne", function (err) {
			if (err) {
				console.error(err);
			}
		});
	});
}

/**
 * Add a message to the discussion page of a user
 * @param user String: the user to warn
 * @param page String: the related page
 * @param url String: the diff url
 */
function addMsgOnUserPage(user, page, url) {
	client.getArticle("Discussion utilisateur:" + Html5Entities.decode(user), function (err, content) {
		if (err) {
			console.error(err);
			return;
		}

		if (content === undefined)
			content = '';

		if (!isBotAllowedInContent(content))
			return;

		var newcontent = content + "\n\n{{subst:User:Signature Manquante (bot)/Modèle:SignezSVP|" + page + "|2=" + url + "}}\n";

		client.edit(
			"Discussion utilisateur:" + Html5Entities.decode(user),
			newcontent,
			"[[Aide:Signature/résumé|Signature manquante]] sur [[" + page + "]] !",
			function (err, data) {
				if (err) {
					console.error(err);
				}

				console.log(data);
				console.log("Message added");
			});
	});
}

/**
 * Sign the specified line
 * @param page String: the page to log
 * @param line String: the problematic line
 * @param id Integer: the id of the edit
 * @param user String: the user that did the action
 */
function signLine(page, line, id, user) {
	client.getArticle(page, function (err, content) {
		if (err) {
			console.error(err);
			return;
		}

		var unsigned = " {{non signé|" + user + "|~~~~~|" + id + "}}",
			newcontent = content.replace(line, line + unsigned);

		client.edit(
			page,
			newcontent,
			"[[Aide:Signature/résumé|Signature manquante]] (beta) ([[Utilisateur:Signature Manquante (bot)/Journal|signaler un faux-positif]])",
			function (err, data) {
				if (err) {
					console.error(err);
				}

				console.log(data);
				console.log("Signed !");
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
function isDiscussion(title, callback) {
	// Discussion page
	if (title.startsWith("Discussion")) {
		// Not specific subpages
		var regex = new RegExp("/(À faire$|Archiv|Brouillon)", "i");
		if (regex.test(title))
			callback(null, false);
		else {
			isBotAllowed(title, function (err, value) {
				callback(err, value);
			});
		}
	}
	// Meta page
	else if (title.startsWith("Wikipédia:")) {
		isMetaDiscussion(title, function (err, value) {
			if (value) {
				isBotAllowed(title, function (err, value) {
					callback(err, value);
				});
			}
			else
				callback(err, false);
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
function isMetaDiscussion(title, callback) {
	var params = {
		action: 'parse',
		page: title,
		prop: 'properties'
	};

	client.api.call(params, function (err, info) {
		if (info !== undefined && info.properties !== undefined) {
			for (var i = 0; i < info.properties.length; i++) {
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
function isUserElligible(username, flags, callback) {
	// Not a bot edit
	if (flags !== undefined && flags.indexOf("B") != -1) {
		callback(null, false);
		return;
	}

	// Update DB (sometimes)
	if (Math.floor(Math.random() * 10) + 1 == 2)
		updateUserDB();

	// Opt-in
	if (list_optin !== undefined && list_optin.indexOf(username) != -1) {
		callback(null, true);
		return;
	}

	// Opt-out
	if (list_optout !== undefined && list_optout.indexOf(username) != -1) {
		callback(null, false);
		return;
	}

	// Autopatolled
	isAutopatrolled(username, function (err, result) {
		callback(err, !result);
	});
}

/**
 * Check if a line is an unsigned comment
 * @param line String: The line to check
 * @param title String: The title of the page
 * @param summary String: The summary of the edition
 * @param username String: The user that did the action
 * @param content String: The content (context)
 * @return Boolean
 */
function isUnsignedComment(line, title, summary, username, content) {
	var regex,
		userregexp = String(escapeStringRegexp(username)).replace(" ", "[ _]"); // User var

	// Test is username could have htmlentities
	if (username != Html5Entities.encode(username))
		userregexp = "(" + userregexp + "|" + Html5Entities.encode(userregexp) + ")";

	// Test if it is a complete line
	if (content.indexOf(line + "\n") == -1 && !content.endsWith(line))
		return false;

	// Test the summary
	regex = new RegExp("^(révocation|annulation|/\\* articles à |copie|archiv)", "i");
	if (regex.test(summary))
		return false;

	// Tests on the whole page
	regex = /\{\{Arbre(.+)}}/i;
	if (regex.test(content))
		return false;

	// If section 0 and own userpage
	if (title.startsWith("Discussion Utilisateur:" + username)) {
		regex = new RegExp("==[\\s\\S]+" + line);
		if (!regex.test(content))
			return false;
	}

	// Test the specifc line
	// List of regexes
	var regexes = [
		new RegExp("\\[\\[(Utilisat(eur|rice)|User|Spécial:Contributions/|Discussion Utilisat(eur|rice)):" + userregexp, "i"), // Non-signé
		new RegExp("{{\\s*(__|auteurs crédités après|si|suppression immédiate|speedy|sd|dsi|delete|db|page conservée|avertissement homonymie|traduit de|wikiprojet|À faire|ip scolaire|ip partagée|icône|arbre|wikipédia n'est pas un forum|nobots|bots|Wikidata|boite|boîte|ne pas archiver|marronnier)", "i"), // modèles
		new RegExp("\\[\\[Catégorie:", "i"), // Catégorie
		new RegExp("^{?[\\|!]"), // Paramètre de modèle ou tableau
		new RegExp("{\\|"), // Tableau
		new RegExp("^({{.+}}|#REDIRECTION\\[\\[.+]])$"), // Juste un modèle ou redirection
		new RegExp("^\\s+$"), // Seulement du vide
		new RegExp("^ *\\*[^:].+\\n"), // Simple élément de liste à puce
		new RegExp("^(==*).+\\1$"), // Seulement un titre
		new RegExp("^__TOC__$"), // TOC only
		new RegExp("^<div.+</div>$"), // HTML (div)
		new RegExp("^[[(Fichier|File):.+]]") // Fichier only
	];

	// Test each regex - if regex is valid: that's it
	console.log(line);
	for (var i = 0; i < regexes.length; i++) {
		console.log("- '" + regexes[i] + "' -> " + regexes[i].test(line));
		if (regexes[i].test(line))
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
Array.prototype.replaceArray = function (find, replace) {
	var replaceArray = this;
	for (var i = 0; i < replaceArray.length; i++) {
		replaceArray[i] = replaceArray[i].replace(find, replace);
	}
	return replaceArray;
};

/**
 * Search for 'search' at the beginning of the String
 * @param search String: the string to search for
 * @returns {boolean}
 */
String.prototype.startsWith = function (search) {
	var hay = this;
	if (hay.indexOf(search) === 0)
		return true;
	return false;
};

/**
 * Search for 'search' at the end of String
 * @param search String: the string to search for
 * @returns {boolean}
 */
String.prototype.endsWith = function (search) {
	var hay = this.toString(),
		pos = hay.length - search.length;

	var lastIndex = hay.indexOf(search, pos);
	return lastIndex !== -1 && lastIndex === pos;
};


