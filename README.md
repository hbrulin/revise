# Révise ensemble

Mini application web libre pour trouver des lieux et organiser des révisions entre étudiant·es. Interface statique (HTML/CSS/JS), carte OpenStreetMap via Leaflet et stockage partagé facultatif avec Supabase.

## Lancer en local

Depuis ce dossier, lance un petit serveur local avec `python3 -m http.server 8000`, puis ouvre `http://localhost:8000`. Les bibliothèques, polices et tuiles de carte sont chargées depuis leurs services publics. Sans configuration Supabase, l’application affiche une démo et les ajouts restent dans la session courante du navigateur.

Les lieux de démonstration sont à Paris. Pour proposer un vrai lieu ailleurs, saisis une adresse complète avec ville et pays ; le marqueur utilise OpenStreetMap/Nominatim, à la demande après soumission du formulaire. Le serveur public Nominatim est limité et ne doit pas être sollicité à répétition ; pour un usage régulier, configure un fournisseur de géocodage adapté. La recherche texte fonctionne aussi par quartier ou matière.

## Activer la base partagée

1. Crée un projet Supabase.
2. Dans **SQL Editor**, exécute le contenu de `schema.sql`.
3. Dans **Project Settings → API**, copie l’URL du projet et la clé `anon` / `publishable`.
4. Colle-les dans `config.js` (`supabaseUrl`, `supabaseAnonKey`). Cette clé publique peut être incluse dans le site ; n’utilise jamais une clé `service_role`.
5. Publie le dépôt avec **Settings → Pages → Deploy from a branch** et choisis la branche et le dossier racine.

La base de données n’est pas créée ni hébergée par GitHub Pages : il faut un projet Supabase pour le partage entre visiteurs. Le schéma permet la lecture et l’ajout publics, mais pas la modification ou la suppression. C’est volontairement un prototype léger, pas encore un service modéré prêt à ouvrir largement.

## Vie privée et groupes

Les profils, disponibilités, besoins déclarés, contact public et critères de groupe cochés sont visibles publiquement dès qu’ils sont publiés. Les critères sont déclaratifs : l’application ne déduit aucune identité. N’ajoute pas de nom complet, d’adresse de domicile, de diagnostic ou d’information intime. Pour le contact, préfère un pseudo de messagerie dédié plutôt qu’un numéro de téléphone ou une adresse personnelle. Pour les lieux, publie un lieu public ou associatif et non une adresse privée. Le schéma de départ n’inclut pas de compte utilisateur ni de procédure de modification/suppression en libre-service. Avant un lancement public, il faut ajouter une authentification, une suppression/édition par la personne concernée, un mécanisme anti-spam et une politique de confidentialité adaptée.

## Licence

Code sous licence MIT (voir `LICENSE`). Leaflet est sous BSD-2-Clause ; OpenStreetMap conserve ses conditions d’attribution. Le projet ne stocke pas de fond de carte propriétaire.
# revise
