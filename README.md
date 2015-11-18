WP-OubliSignature-Bot
========================
[![Build Status](https://api.travis-ci.org/ValentinBrclz/WP-OubliSignature-Bot.png)](http://travis-ci.org/ValentinBrclz/WP-OubliSignature-Bot)
[![Dependency Status](https://img.shields.io/david/ValentinBrclz/WP-OubliSignature-Bot.svg?style=flat)](https://david-dm.org/ValentinBrclz/WP-OubliSignature-Bot#info=Dependencies)
[![devDependency Status](https://img.shields.io/david/dev/ValentinBrclz/WP-OubliSignature-Bot.svg?style=flat)](https://david-dm.org/ValentinBrclz/WP-OubliSignature-Bot#info=devDependencies)
[![License](https://img.shields.io/badge/license-GPLv2-blue.svg?style=flat)](http://opensource.org/licenses/GPL-2.0)

_**(en)**_ French speaking Wikipedia bot that signs when users forget to do so. Since this is **only** for the french speaking version of Wikipedia, documentation, comments, etc. may be sometimes in French

_**(fr)**_ Robot de la Wikipédia francophone qui signe lorsqu'un utilisateur oublie de le faire et le prévient lorsque le comportement est récurrent.

## Fonctionnement
**Conditions**

La contribution doit être effectuée :
 1. sur une page de discussion ou page assimilée comme telle (sauf "/À faire") ;
 2. par un utilisateur éligible (opt-in, opt-out, autopatrolled) ;
 3. sous la forme d'un nouveau commentaire ;
 4. sans signature valide.

**Actions**
* Ajouter l'entrée au journal
* Prévenir l'utilisateur
* Ajouter le modèle {{non signé}}

### Inscription (opt-in)
Pour recevoir des messages et/ou être corrigé par le bot, il est possible de s'inscrire en ajoutant sur la page utilisateur principale la catégorie cachée : Utilisateur avec contrôle de signature ;

Les utilisateurs qui ne sont pas _autopatrolled_ sont inscrits par défaut.

### Désinscription (opt-out)
Pour ne pas recevoir de messages et/ou ne pas être corrigé par le bot, il est possible de se désinscrire en ajoutant sur la page utilisateur principale :
* Soit la catégorie cachée : Utilisateur sans contrôle de signature ;
* Soit le modèle {{Utilisateur sans contrôle de signature}}

## Voir le robot
Le robot fonctionne sur Wikipédia sous le nom [Signature Manquante (bot)](https://fr.wikipedia.org/wiki/Utilisateur:Signature_Manquante_(bot))

## License
* License: GNU General Public Licence (2.0)
* Author: [Valentin Berclaz](https://github.com/ValentinBrclz)
* Inspired by: SignBot from [Zhuyifei1999](https://commons.wikimedia.org/wiki/User:Zhuyifei1999) on Wikimedia Commons
