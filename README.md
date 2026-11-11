# Révise ensemble

Application web libre pour repérer des lieux de révision et s’organiser entre étudiant·es. Interface statique (HTML/CSS/JS), carte OpenStreetMap/Leaflet et base partagée Supabase.

## Lancer en local

Depuis ce dossier, lance `python3 -m http.server 8000`, puis ouvre `http://localhost:8000`. Sans config Supabase, l’application affiche des exemples de Paris. Les services externes (carte et recherche de lieux) nécessitent une connexion Internet.

## Mise à jour Supabase

Dans **SQL Editor**, exécute le contenu mis à jour de `schema.sql`. Il ajoute les colonnes nécessaires, la table des présences, les règles de propriété et les règles de sécurité. Les anciennes lignes restent en base ; les anciennes fiches créées avant la mise à jour ont `owner_id` vide et ne pourront pas être modifiées/supprimées depuis la nouvelle interface.

Dans **Authentication → Providers**, active les connexions anonymes. L’application utilise cette session locale au navigateur pour associer « Ma fiche », ses modifications/suppressions et les présences. Si le stockage du navigateur est effacé, la session anonyme peut être perdue.

Dans **Project Settings → API**, renseigne l’URL du projet et la clé publique `anon`/`publishable` dans `config.js`. L’application accepte aussi l’identifiant seul du projet. Cette clé publique peut être dans le site ; n’utilise jamais `service_role`.

## Lieux, recherche et filtres

L’autocomplete des lieux publics utilise Photon, basé sur OpenStreetMap. L’instance publique est prévue pour un trafic raisonnable, sans garantie de disponibilité ; `photonBaseUrl` dans `config.js` permet de changer de fournisseur. La recherche d’adresse est envoyée après saisie à Photon. Ne mets pas d’information personnelle dans cette recherche.

Pour publier un lieu, il faut choisir une suggestion dans l’autocomplete et renseigner au moins un jour disponible. Une présence ne peut être ajoutée qu’à une date dont le jour de la semaine figure dans les disponibilités du lieu ; une présence existante reste annulable.

Les filtres couvrent Paris intramuros (75), les sept départements autour (77, 78, 91, 92, 93, 94, 95), puis un département choisi. Les résultats de Photon permettent de renseigner le département à partir du code postal ou de la commune. La migration classe comme Paris les anciennes lignes dont l’adresse indique Paris ou un code postal parisien ; les autres restent visibles dans « Toute l’Île-de-France » jusqu’à ce que leur adresse soit mise à jour.

## Publication GitHub Pages

Le dépôt se publie depuis **Settings → Pages → Deploy from a branch**, en choisissant la branche voulue et `/(root)`. La base partagée est hébergée par Supabase, pas par GitHub Pages. Les changements de code doivent être poussés sur la branche publiée pour apparaître sur le site.

## Données personnelles

Il n’existe pas d’annuaire ni de recherche d’étudiant·es. Une fiche est visible par son propriétaire, sur le détail d’un lieu publié par cette personne et dans la liste des personnes inscrites à un lieu publié. Créer une fiche est obligatoire avant de proposer un lieu ou d’annoncer sa présence ; l’interface et les règles Supabase vérifient cette condition. La fiche et les présences peuvent être consultées dans ces contextes par les visiteurs du site. Leur publication demande un consentement explicite. Les critères de groupe sont déclaratifs et l’application ne déduit aucune identité. N’indique pas de nom complet, d’adresse privée, de diagnostic, de numéro de téléphone ou d’information intime. Le contact doit être un pseudo public. Les fiches créées avec la nouvelle version peuvent être modifiées et supprimées par leur propriétaire ; les présences à un lieu peuvent être annulées par la personne inscrite.

## Licence

Code sous licence MIT (voir `LICENSE`). Leaflet est sous BSD-2-Clause ; OpenStreetMap conserve ses conditions d’attribution.
