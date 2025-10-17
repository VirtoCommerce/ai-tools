# Test Data Reference - Multilingual SEO URLs

**Project:** Virto Commerce  
**Feature:** Multilingual SEO-Friendly URLs  
**Version:** 1.0  
**Date:** October 14, 2025

---

## Table of Contents

1. [Language Configuration](#1-language-configuration)
2. [Sample URLs by Page Type](#2-sample-urls-by-page-type)
3. [Expected Translations](#3-expected-translations)
4. [Test Products](#4-test-products)
5. [Test Categories](#5-test-categories)
6. [Error Scenarios](#6-error-scenarios)
7. [SEO Meta Data Examples](#7-seo-meta-data-examples)
8. [Local Storage Keys](#8-local-storage-keys)

---

## 1. Language Configuration

### Configured Languages

| Language | Code | ISO 639-1 | ISO 3166-1 | URL Format | Default |
|----------|------|-----------|------------|------------|---------|
| English (United States) | en-US | en | US | No prefix (root) | Yes |
| Norwegian | no | no | NO | `/no/` prefix | No |
| German | de | de | DE | `/de/` prefix | No |
| French | fr | fr | FR | `/fr/` prefix | No |
| Italian | it-IT | it | IT | `/it/` prefix | No |

### Language Display Names

| Language Code | Native Name | English Name |
|---------------|-------------|--------------|
| en-US | English (United States) | English (United States) |
| no | Norsk | Norwegian |
| de | Deutsch | German |
| fr | Français | French |
| it-IT | Italiano | Italian |

---

## 2. Sample URLs by Page Type

### 2.1 Static Pages

#### Dashboard  Page

| Language | URL | Status |
|----------|-----|--------|
| English (default) | `https://example.com/account/dashboard` | Active |
| Norwegian | `https://example.com/no/account/dashboard` | Active |
| German | `https://example.com/de/über-uns` | Active |
| French | `https://example.com/fr/à-propos` | Active |
| Italian | `https://example.com/it/chi-siamo` | Active |

**Alternative URL formats (if localized slugs not implemented):**
- Norwegian: `https://example.com/no/account/dashboard`
- German: `https://example.com/de/account/dashboard`
- French: `https://example.com/fr/account/dashboard`
- Italian: `https://example.com/it/account/dashboard`

#### Contact Page

| Language | URL | Status |
|----------|-----|--------|
| English (default) | `https://example.com/contact` | Active |
| Norwegian | `https://example.com/no/contact` | Active |
| German | `https://example.com/de/kontakt` | Active |
| French | `https://example.com/fr/contact` | Active |
| Italian | `https://example.com/it/contatti` | Active |

#### Cart Page

| Language | URL | Status |
|----------|-----|--------|
| English (default) | `https://example.com/cart` | Active |
| Norwegian | `https://example.com/no/cart` | Active |
| German | `https://example.com/de/warenkorb` OR `/de/cart` | Active |
| French | `https://example.com/fr/panier` OR `/fr/cart` | Active |
| Italian | `https://example.com/it/carrello` OR `/it/cart` | Active |

#### Checkout Page

| Language | URL | Status |
|----------|-----|--------|
| English (default) | `https://example.com/checkout` | Active |
| Norwegian | `https://example.com/no/checkout` | Active |
| German | `https://example.com/de/kasse` OR `/de/checkout` | Active |
| French | `https://example.com/fr/caisse` OR `/fr/checkout` | Active |
| Italian | `https://example.com/it/pagamento` OR `/it/checkout` | Active |


### 2.2 Dynamic Pages - Products

#### Sample Product: "Wireless Headphones"

| Language | Product Name | URL Slug | Full URL |
|----------|--------------|----------|----------|
| English | Wireless Headphones | wireless-headphones | `https://example.com/products/wireless-headphones` |
| Norwegian | Trådløse hodetelefoner | tradlose-hodetelefoner | `https://example.com/no/products/tradlose-hodetelefoner` |
| German | Kabellose Kopfhörer | kabellose-kopfhorer | `https://example.com/de/products/kabellose-kopfhorer` |
| French | Écouteurs sans fil | ecouteurs-sans-fil | `https://example.com/fr/products/ecouteurs-sans-fil` |
| Italian | Cuffie wireless | cuffie-wireless | `https://example.com/it/products/cuffie-wireless` |

**Product ID:** `PROD-001` (consistent across all languages)

#### Sample Product: "Running Shoes"

| Language | Product Name | URL Slug | Full URL |
|----------|--------------|----------|----------|
| English | Running Shoes | running-shoes | `https://example.com/products/running-shoes` |
| Norwegian | Løpesko | lopesko | `https://example.com/no/products/lopesko` |
| German | Laufschuhe | laufschuhe | `https://example.com/de/products/laufschuhe` |
| French | Chaussures de course | chaussures-de-course | `https://example.com/fr/products/chaussures-de-course` |
| Italian | Scarpe da corsa | scarpe-da-corsa | `https://example.com/it/products/scarpe-da-corsa` |

**Product ID:** `PROD-002`

#### Sample Product: "Coffee Maker"

| Language | Product Name | URL Slug | Full URL |
|----------|--------------|----------|----------|
| English | Coffee Maker | coffee-maker | `https://example.com/products/coffee-maker` |
| Norwegian | Kaffemaskin | kaffemaskin | `https://example.com/no/products/kaffemaskin` |
| German | Kaffeemaschine | kaffeemaschine | `https://example.com/de/products/kaffeemaschine` |
| French | Cafetière | cafetiere | `https://example.com/fr/products/cafetiere` |
| Italian | Macchina per caffè | macchina-per-caffe | `https://example.com/it/products/macchina-per-caffe` |

**Product ID:** `PROD-003`

### 2.3 Dynamic Pages - Categories

#### Category: "Electronics"

| Language | Category Name | URL Slug | Full URL |
|----------|---------------|----------|----------|
| English | Electronics | electronics | `https://example.com/category/electronics` |
| Norwegian | Elektronikk | elektronikk | `https://example.com/no/category/elektronikk` |
| German | Elektronik | elektronik | `https://example.com/de/category/elektronik` |
| French | Électronique | electronique | `https://example.com/fr/category/electronique` |
| Italian | Elettronica | elettronica | `https://example.com/it/category/elettronica` |

**Category ID:** `CAT-001`

#### Category: "Clothing"

| Language | Category Name | URL Slug | Full URL |
|----------|---------------|----------|----------|
| English | Clothing | clothing | `https://example.com/category/clothing` |
| Norwegian | Klær | klaer | `https://example.com/no/category/klaer` |
| German | Kleidung | kleidung | `https://example.com/de/category/kleidung` |
| French | Vêtements | vetements | `https://example.com/fr/category/vetements` |
| Italian | Abbigliamento | abbigliamento | `https://example.com/it/category/abbigliamento` |

**Category ID:** `CAT-002`

#### Category: "Home & Garden"

| Language | Category Name | URL Slug | Full URL |
|----------|---------------|----------|----------|
| English | Home & Garden | home-garden | `https://example.com/category/home-garden` |
| Norwegian | Hjem og hage | hjem-og-hage | `https://example.com/no/category/hjem-og-hage` |
| German | Haus und Garten | haus-und-garten | `https://example.com/de/category/haus-und-garten` |
| French | Maison et jardin | maison-et-jardin | `https://example.com/fr/category/maison-et-jardin` |
| Italian | Casa e Giardino | casa-e-giardino | `https://example.com/it/category/casa-e-giardino` |

**Category ID:** `CAT-003`

### 2.4 User Account Pages

#### Account Dashboard

| Language | URL |
|----------|-----|
| English (default) | `https://example.com/account` OR `/profile` |
| Norwegian | `https://example.com/no/konto` OR `/no/account` |
| German | `https://example.com/de/konto` OR `/de/account` |
| French | `https://example.com/fr/compte` OR `/fr/account` |
| Italian | `https://example.com/it/conto` OR `/it/account` |

#### Order History

| Language | URL |
|----------|-----|
| English (default) | `https://example.com/account/orders` |
| Norwegian | `https://example.com/no/konto/bestillinger` OR `/no/account/orders` |
| German | `https://example.com/de/konto/bestellungen` OR `/de/account/orders` |
| French | `https://example.com/fr/compte/commandes` OR `/fr/account/orders` |
| Italian | `https://example.com/it/conto/ordini` OR `/it/account/orders` |

#### Profile Settings

| Language | URL |
|----------|-----|
| English (default) | `https://example.com/account/settings` |
| Norwegian | `https://example.com/no/konto/innstillinger` OR `/no/account/settings` |
| German | `https://example.com/de/konto/einstellungen` OR `/de/account/settings` |
| French | `https://example.com/fr/compte/parametres` OR `/fr/account/settings` |
| Italian | `https://example.com/it/conto/impostazioni` OR `/it/account/settings` |

### 2.5 Search Results

#### Global Search Query: "auto"

| Language | Search Term | URL |
|----------|-------------|-----|
| English | auto | `https://example.com/search?q=auto` |
| Norwegian | auto | `https://example.com/no/search?q=auto` OR `/no/søk?q=auto` |
| German | auto | `https://example.com/de/search?q=auto` OR `/de/suche?q=auto` |
| French | auto | `https://example.com/fr/search?q=auto` OR `/fr/recherche?q=auto` |
| Italian | auto | `https://example.com/it/search?q=auto` OR `/it/cerca?q=auto` |

#### Category-Specific Search Query: "mini" in TV Category

| Language | Search Term | URL |
|----------|-------------|-----|
| English | mini | `https://example.com/tv?q=mini` |
| Norwegian | mini | `https://example.com/no/tv?q=mini` |
| German | mini | `https://example.com/de/tv?q=mini` |
| French | mini | `https://example.com/fr/tv?q=mini` |
| Italian | mini | `https://example.com/it/tv?q=mini` |

**Note:** Category-specific searches maintain the language prefix and filter products within that category.

### 2.6 Company Pages (B2B)

#### Company Information Page

| Language | URL | Page Title |
|----------|-----|------------|
| English (default) | `https://example.com/company/info` | Company Information |
| Norwegian | `https://example.com/no/company/info` | Firmainformasjon |
| German | `https://example.com/de/company/info` | Unternehmensinformationen |
| French | `https://example.com/fr/company/info` | Informations sur l'entreprise |
| Italian | `https://example.com/it/company/info` | Informazioni sull'azienda |

**Edit URLs:**
- English: `/account/quotes/id/edit`
- Norwegian: `/no/account/quotes/id/edit`
- German: `/de/account/quotes/id/edit`
- French:`/fr/account/quotes/id/edit`
- Italian: `/it/account/quotes/id/edit`

#### Company Members Page

| Language | URL | Page Title |
|----------|-----|------------|
| English (default) | `https://example.com/company/members` | Company Members |
| Norwegian | `https://example.com/no/company/members` | Firmamedlemmer |
| German | `https://example.com/de/company/members` | Firmenmitglieder |
| French | `https://example.com/fr/company/members` | Membres de l'entreprise |
| Italian | `https://example.com/it/company/members` | Membri dell'azienda |


#### Account Sub-Pages (Comprehensive)

| Page Type | English (Default) | German | Norwegian | French | Italian |
|-----------|-------------------|--------|-----------|--------|---------|
| **Dashboard** | `/account/dashboard` | `/de/account/dashboard` | `/no/account/dashboard` | `/fr/account/dashboard` | `/it/account/dashboard` |
| **Orders** | `/account/orders` | `/de/account/orders` | `/no/account/orders` | `/fr/account/orders` | `/it/account/orders` |
| **Order Detail** | `/account/orders/{id}` | `/de/account/orders/{id}` | `/no/account/orders/{id}` | `/fr/account/orders/{id}` | `/it/account/orders/{id}` |
| **Profile** | `/account/profile` | `/de/account/profile` | `/no/account/profile` | `/fr/account/profile` | `/it/account/profile` |
| **Settings** | `/account/settings` | `/de/account/settings` | `/no/account/settings` | `/fr/account/settings` | `/it/account/settings` |
| **Addresses** | `/account/addresses` | `/de/account/addresses` | `/no/account/addresses` | `/fr/account/addresses` | `/it/account/addresses` |
| **Add Address** | `/account/addresses/add` | `/de/account/addresses/add` | `/no/account/addresses/add` | `/fr/account/addresses/add` | `/it/account/addresses/add` |
| **Edit Address** | `/account/addresses/{id}/edit` | `/de/account/addresses/{id}/edit` | `/no/account/addresses/{id}/edit` | `/fr/account/addresses/{id}/edit` | `/it/account/addresses/{id}/edit` |
| **Lists/Wishlist** | `/account/lists` | `/de/account/lists` | `/no/account/lists` | `/fr/account/lists` | `/it/account/lists` |
| **Payment Methods** | `/account/payment-methods` | `/de/account/payment-methods` | `/no/account/payment-methods` | `/fr/account/payment-methods` | `/it/account/payment-methods` |
| **Notifications** | `/account/notifications` | `/de/account/notifications` | `/no/account/notifications` | `/fr/account/notifications` | `/it/account/notifications` |

---

## 3. Expected Translations

### 3.1 Common UI Elements

| English (en-US) | Norwegian (no) | German (de) | French (fr) | Italian (it-IT) |
|-----------------|----------------|-------------|-------------|-----------------|
| Home | Hjem | Startseite | Accueil | Home |
| Products | Produkter | Produkte | Produits | Prodotti |
| Categories | Kategorier | Kategorien | Catégories | Categorie |
| Cart | Handlekurv | Warenkorb | Panier | Carrello |
| Checkout | Kasse | Kasse | Caisse | Pagamento |
| Account | Konto | Konto | Compte | Conto |
| Profile | Profil | Profil | Profil | Profilo |
| Orders | Bestillinger | Bestellungen | Commandes | Ordini |
| Settings | Innstillinger | Einstellungen | Paramètres | Impostazioni |
| Sign In | Logg inn | Anmelden | Se connecter | Accedi |
| Sign Out | Logg ut | Abmelden | Se déconnecter | Esci |
| Register | Registrer | Registrieren | S'inscrire | Registrati |
| Search | Søk | Suche | Recherche | Cerca |
| Dashboard | Om oss | Über uns | À propos | Chi siamo |
| Contact | Kontakt | Kontakt | Contact | Contatti |
| Help | Hjelp | Hilfe | Aide | Aiuto |
| Privacy Policy | Personvernregler | Datenschutz | Politique de confidentialité | Informativa sulla privacy |
| Terms of Service | Vilkår for bruk | Nutzungsbedingungen | Conditions d'utilisation | Termini di servizio |

### 3.2 Product Page Elements

| English (en-US) | Norwegian (no) | German (de) | French (fr) | Italian (it-IT) |
|-----------------|----------------|-------------|-------------|-----------------|
| Add to Cart | Legg i handlekurv | In den Warenkorb | Ajouter au panier | Aggiungi al carrello |
| Buy Now | Kjøp nå | Jetzt kaufen | Acheter maintenant | Acquista ora |
| Out of Stock | Utsolgt | Nicht verfügbar | Rupture de stock | Esaurito |
| In Stock | På lager | Auf Lager | En stock | Disponibile |
| Price | Pris | Preis | Prix | Prezzo |
| Description | Beskrivelse | Beschreibung | Description | Descrizione |
| Specifications | Spesifikasjoner | Spezifikationen | Spécifications | Specifiche |
| Reviews | Anmeldelser | Bewertungen | Avis | Recensioni |
| Related Products | Relaterte produkter | Ähnliche Produkte | Produits associés | Prodotti correlati |

### 3.3 Cart & Checkout Elements

| English (en-US) | Norwegian (no) | German (de) | French (fr) | Italian (it-IT) |
|-----------------|----------------|-------------|-------------|-----------------|
| Your Cart | Din handlekurv | Ihr Warenkorb | Votre panier | Il tuo carrello |
| Subtotal | Delsum | Zwischensumme | Sous-total | Subtotale |
| Total | Totalt | Gesamt | Total | Totale |
| Continue Shopping | Fortsett å handle | Weiter einkaufen | Continuer les achats | Continua a fare acquisti |
| Proceed to Checkout | Gå til kassen | Zur Kasse gehen | Passer à la caisse | Procedi al pagamento |
| Shipping Address | Leveringsadresse | Lieferadresse | Adresse de livraison | Indirizzo di spedizione |
| Payment Method | Betalingsmetode | Zahlungsmethode | Mode de paiement | Metodo di pagamento |
| Place Order | Legg inn bestilling | Bestellung aufgeben | Passer commande | Effettua ordine |
| Order Confirmation | Ordrebekreftelse | Auftragsbestätigung | Confirmation de commande | Conferma ordine |

### 3.4 Error Messages

| English (en-US) | Norwegian (no) | German (de) | French (fr) | Italian (it-IT) |
|-----------------|----------------|-------------|-------------|-----------------|
| Page Not Found | Siden ble ikke funnet | Seite nicht gefunden | Page non trouvée | Pagina non trovata |
| 404 Error | 404-feil | 404-Fehler | Erreur 404 | Errore 404 |
| Invalid URL | Ugyldig URL | Ungültige URL | URL invalide | URL non valido |
| Language Not Supported | Språket støttes ikke | Sprache wird nicht unterstützt | Langue non prise en charge | Lingua non supportata |

### 3.5 Company Pages (B2B)

#### Company Info Page Elements

| English (en-US) | Norwegian (no) | German (de) | French (fr) | Italian (it-IT) |
|-----------------|----------------|-------------|-------------|-----------------|
| Company Information | Firmainformasjon | Unternehmensinformationen | Informations sur l'entreprise | Informazioni sull'azienda |
| Company Name | Firmanavn | Firmenname | Nom de l'entreprise | Nome dell'azienda |
| Address | Adresse | Adresse | Adresse | Indirizzo |
| Tax ID | Organisasjonsnummer | Steuernummer | Numéro d'identification fiscale | Partita IVA |
| Phone Number | Telefonnummer | Telefonnummer | Numéro de téléphone | Numero di telefono |
| Email | E-post | E-Mail | Email | Email |
| Industry | Bransje | Branche | Industrie | Settore |
| Status | Status | Status | Statut | Stato |
| Active | Aktiv | Aktiv | Actif | Attivo |
| Pending | Venter | Ausstehend | En attente | In attesa |
| Inactive | Inaktiv | Inaktiv | Inactif | Inattivo |
| Edit | Rediger | Bearbeiten | Modifier | Modifica |
| Save | Lagre | Speichern | Enregistrer | Salva |
| Cancel | Avbryt | Abbrechen | Annuler | Annulla |
| Company Description | Firmabeskrivelse | Unternehmensbeschreibung | Description de l'entreprise | Descrizione dell'azienda |
| Founded Date | Grunnlagt | Gründungsdatum | Date de fondation | Data di fondazione |

#### Company Members Page Elements

| English (en-US) | Norwegian (no) | German (de) | French (fr) | Italian (it-IT) |
|-----------------|----------------|-------------|-------------|-----------------|
| Company Members | Firmamedlemmer | Firmenmitglieder | Membres de l'entreprise | Membri dell'azienda |
| Add Member | Legg til medlem | Mitglied hinzufügen | Ajouter un membre | Aggiungi membro |
| Name | Navn | Name | Nom | Nome |
| Email | E-post | E-Mail | Email | Email |
| Role | Rolle | Rolle | Rôle | Ruolo |
| Status | Status | Status | Statut | Stato |
| Actions | Handlinger | Aktionen | Actions | Azioni |
| Administrator | Administrator | Administrator | Administrateur | Amministratore |
| Manager | Leder | Manager | Gestionnaire | Manager |
| Employee | Ansatt | Mitarbeiter | Employé | Dipendente |
| Member | Medlem | Mitglied | Membre | Membro |
| Edit | Rediger | Bearbeiten | Modifier | Modifica |
| Delete | Slett | Löschen | Supprimer | Elimina |
| View | Vis | Ansehen | Voir | Visualizza |
| Search members | Søk medlemmer | Mitglieder suchen | Rechercher des membres | Cerca membri |
| No results found | Ingen resultater funnet | Keine Ergebnisse gefunden | Aucun résultat trouvé | Nessun risultato trovato |
| First Name | Fornavn | Vorname | Prénom | Nome |
| Last Name | Etternavn | Nachname | Nom de famille | Cognome |
| Email Address | E-postadresse | E-Mail-Adresse | Adresse email | Indirizzo email |
| Permissions | Tillatelser | Berechtigungen | Autorisations | Permessi |
| Invite Member | Inviter medlem | Mitglied einladen | Inviter un membre | Invita membro |
| Remove Member | Fjern medlem | Mitglied entfernen | Retirer un membre | Rimuovi membro |
| Member Details | Medlemsdetaljer | Mitgliedsdetails | Détails du membre | Dettagli membro |
| Page {n} of {m} | Side {n} av {m} | Seite {n} von {m} | Page {n} de {m} | Pagina {n} di {m} |
| Next | Neste | Weiter | Suivant | Successivo |
| Previous | Forrige | Zurück | Précédent | Precedente |
| Confirm Delete | Bekreft sletting | Löschen bestätigen | Confirmer la suppression | Conferma eliminazione |
| Are you sure? | Er du sikker? | Sind Sie sicher? | Êtes-vous sûr? | Sei sicuro? |
| Member added successfully | Medlem lagt til | Mitglied erfolgreich hinzugefügt | Membre ajouté avec succès | Membro aggiunto con successo |
| Member updated successfully | Medlem oppdatert | Mitglied erfolgreich aktualisiert | Membre mis à jour avec succès | Membro aggiornato con successo |
| Member removed successfully | Medlem fjernet | Mitglied erfolgreich entfernt | Membre supprimé avec succès | Membro rimosso con successo |
| No members found | Ingen medlemmer funnet | Keine Mitglieder gefunden | Aucun membre trouvé | Nessun membro trovato |
| Add the first member | Legg til det første medlemmet | Fügen Sie das erste Mitglied hinzu | Ajoutez le premier membre | Aggiungi il primo membro |

#### Account Sub-Pages Elements

| English (en-US) | Norwegian (no) | German (de) | French (fr) | Italian (it-IT) |
|-----------------|----------------|-------------|-------------|-----------------|
| Dashboard | Dashbord | Dashboard | Tableau de bord | Dashboard |
| My Account | Min konto | Mein Konto | Mon compte | Il mio conto |
| Orders | Bestillinger | Bestellungen | Commandes | Ordini |
| Order History | Bestillingshistorikk | Bestellhistorie | Historique des commandes | Storico ordini |
| Order Number | Bestillingsnummer | Bestellnummer | Numéro de commande | Numero ordine |
| Date | Dato | Datum | Date | Data |
| Total | Totalt | Gesamt | Total | Totale |
| Profile | Profil | Profil | Profil | Profilo |
| Settings | Innstillinger | Einstellungen | Paramètres | Impostazioni |
| Addresses | Adresser | Adressen | Adresses | Indirizzi |
| Add Address | Legg til adresse | Adresse hinzufügen | Ajouter une adresse | Aggiungi indirizzo |
| Edit Address | Rediger adresse | Adresse bearbeiten | Modifier l'adresse | Modifica indirizzo |
| Shipping Address | Leveringsadresse | Lieferadresse | Adresse de livraison | Indirizzo di spedizione |
| Billing Address | Fakturaadresse | Rechnungsadresse | Adresse de facturation | Indirizzo di fatturazione |
| Wishlist | Ønskeliste | Wunschliste | Liste de souhaits | Lista dei desideri |
| Lists | Lister | Listen | Listes | Liste |
| Payment Methods | Betalingsmetoder | Zahlungsmethoden | Modes de paiement | Metodi di pagamento |
| Notifications | Varsler | Benachrichtigungen | Notifications | Notifiche |
| Preferences | Preferanser | Einstellungen | Préférences | Preferenze |
| Default Language | Standardspråk | Standardsprache | Langue par défaut | Lingua predefinita |
| Default Currency | Standardvaluta | Standardwährung | Devise par défaut | Valuta predefinita |
| Update | Oppdater | Aktualisieren | Mettre à jour | Aggiorna |
| Save Changes | Lagre endringer | Änderungen speichern | Enregistrer les modifications | Salva modifiche |
| Recent Orders | Nylige bestillinger | Neueste Bestellungen | Commandes récentes | Ordini recenti |
| View All Orders | Vis alle bestillinger | Alle Bestellungen anzeigen | Voir toutes les commandes | Visualizza tutti gli ordini |
| Order Status | Bestillingsstatus | Bestellstatus | Statut de la commande | Stato ordine |
| Processing | Behandler | Verarbeitung | En cours de traitement | In elaborazione |
| Completed | Fullført | Abgeschlossen | Terminé | Completato |
| Cancelled | Kansellert | Storniert | Annulé | Annullato |
| Monthly Spending Report | Månedlig utgiftsrapport | Monatlicher Ausgabenbericht | Rapport de dépenses mensuelles | Report spese mensili |
| Budget | Budsjett | Budget | Budget | Budget |
| Total Spent | Totalt brukt | Insgesamt ausgegeben | Total dépensé | Totale speso |

---

## 4. Test Products

### Product 1: Wireless Headphones

| Attribute | English | Norwegian | German | French |
|-----------|---------|-----------|--------|--------|
| **Name** | Wireless Headphones | Trådløse hodetelefoner | Kabellose Kopfhörer | Écouteurs sans fil |
| **Short Description** | Premium sound quality | Premium lydkvalitet | Premium Klangqualität | Qualité audio premium |
| **Price** | $149.00 | 1 299 kr | 149 € | 149 € |
| **SKU** | WH-001 | WH-001 | WH-001 | WH-001 |
| **Category** | Electronics | Elektronikk | Elektronik | Électronique |
| **Stock Status** | In stock | På lager | Auf Lager | En stock |

### Product 2: Running Shoes

| Attribute | English | Norwegian | German | French |
|-----------|---------|-----------|--------|--------|
| **Name** | Running Shoes | Løpesko | Laufschuhe | Chaussures de course |
| **Short Description** | Comfortable and lightweight | Komfortable og lette | Bequem und leicht | Confortables et légères |
| **Price** | $99.00 | 899 kr | 99 € | 99 € |
| **SKU** | RS-002 | RS-002 | RS-002 | RS-002 |
| **Category** | Clothing | Klær | Kleidung | Vêtements |
| **Stock Status** | In stock | På lager | Auf Lager | En stock |

### Product 3: Coffee Maker

| Attribute | English | Norwegian | German | French |
|-----------|---------|-----------|--------|--------|
| **Name** | Coffee Maker | Kaffemaskin | Kaffeemaschine | Cafetière |
| **Short Description** | Automatic brewing system | Automatisk bryggesystem | Automatisches Brühsystem | Système de brassage automatique |
| **Price** | $249.00 | 2 499 kr | 249 € | 249 € |
| **SKU** | CM-003 | CM-003 | CM-003 | CM-003 |
| **Category** | Home & Garden | Hjem og hage | Haus und Garten | Maison et jardin |
| **Stock Status** | In stock | På lager | Auf Lager | En stock |

### Product 4: Portable Digital TV Player (ALCE1993)

| Attribute | English | Norwegian | German | French |
|-----------|---------|-----------|--------|--------|
| **Name** | 10-inch Portable Digital TV Player 1080P HDMI Mini Car TV DVB-T/T2 ISDB-T USB SD VGA | [NO] 10-tommers bærbar digital TV-spiller 1080P HDMI mini bil-TV DVB-T/T2 ISDB-T USB SD VGA | [DE] 10-Zoll tragbarer digitaler Fernseher 1080P HDMI Mini Auto-TV DVB-T/T2 ISDB-T USB SD VGA | [FR] Téléviseur numérique portable de 10 pouces 1080P HDMI Mini TV de voiture DVB-T/T2 ISDB-T USB SD VGA |
| **Short Description** | Portable digital TV with multiple input options | Bærbar digital-TV med flere inngangsmuligheter | Tragbarer Digitalfernseher mit mehreren Eingabeoptionen | TV numérique portable avec plusieurs options d'entrée |
| **Price** | $99.99 | $99.99 | 99,99 $ | 99,99 $ |
| **Original Price** | $100.00 | $100.00 | 100,00 $ | 100,00 $ |
| **SKU** | ALCE1993 | ALCE1993 | ALCE1993 | ALCE1993 |
| **Brand** | TRAVOR | TRAVOR | TRAVOR | TRAVOR |
| **Screen Size** | 27 cm | 27 cm | 27 cm | 27 cm |
| **Category** | Consumer Electronics | Forbrukerelektronikk | Unterhaltungselektronik | Électronique grand public |
| **Subcategory** | Portable Television | Bærbar fjernsyn | Tragbarer Fernseher | Télévision portable |
| **Stock Status** | In stock (1000 units) | På lager (1000 enheter) | Auf Lager (1000 Einheiten) | En stock (1000 unités) |
| **Product URL (EN)** | `/accessories/aliexpress/consumer-electronics/portable-television/10inch-portable-tv-digital-television-player-1080p-hdmi-mini-car-dvb-t2-isdb-t-usb-sd-vga` | | | |
| **Product URL (NO)** | `/no/accessories/aliexpress/consumer-electronics/portable-television/10inch-portable-tv-digital-television-player-1080p-hdmi-mini-car-dvb-t2-isdb-t-usb-sd-vga` | | | |
| **Product URL (DE)** | `/de/accessories/aliexpress/consumer-electronics/portable-television/10-zoll-tragbarer-digitaler-fernseher-1080p-hdmi-mini-auto-dvb-t2-isdb-t-usb-sd-vga-de` | | | |

#### Product Specifications

| Specification | Value |
|--------------|-------|
| **Screen Size** | 27 cm (10 inches) |
| **Resolution** | 1080P |
| **Inputs** | HDMI, USB, SD Card, VGA |
| **TV Standards** | DVB-T/T2, ISDB-T |
| **Use Case** | Portable TV, Car TV, Travel |
| **Brand** | TRAVOR |

#### Test Usage

This product is used for testing:
- **Cart language switching** (Test LS-005)
- **Product search by SKU**
- **Multi-language product titles**
- **Cart persistence across language changes**
- **Product URL localization**

#### Key Testing Observations

**Cart Behavior:**
- When added to cart in Norwegian, product title shows: `[NO] 10-tommers bærbar digital TV-spiller...`
- When language switched to German, cart still shows Norwegian title (see BUG-001)
- Recently viewed section DOES update to German: `[DE] 10-Zoll tragbarer digitaler Fernseher...`

**Price Display:**
- Norwegian format: `$ 99,99` (comma as decimal separator)
- German format: `99,99 $` (comma as decimal separator, dollar sign after)
- English format: `$99.99` (period as decimal separator)

---

## 5. Test Categories

### Category 1: TV (Portable mini TV)

| Attribute | English (GB) | Norwegian | German | French |
|-----------|-------------|-----------|--------|--------|
| **Category Name** | [GB] Portable mini TV | [NO] Bærbar mini-TV | [DE] Tragbares Mini-TV | [FR] Mini TV portable |
| **Parent Category** | TV | TV | TV | TV |
| **Description** | Portable mini televisions and digital TV players | Bærbare minifjernsynsapparater og digitale TV-spillere | Tragbare Mini-Fernseher und digitale TV-Player | Téléviseurs portables mini et lecteurs TV numériques |
| **Product Count** | 41 products | 41 produkter | 41 Produkte | 41 produits |
| **Category URL** | `/en-GB/tv/portable-mini-television-gb` | `/no/tv/portable-mini-television-no` | `/de/tv/tragbares-mini-fernsehen-de` | `/fr/tv/mini-television-portable-fr` |
| **Parent URL** | `/en-GB/tv` | `/no/tv` | `/de/tv` | `/fr/tv` |
| **Price Range** | $99.99 - $100.00 | $99.99 - $100.00 | 99,99 $ - 100,00 $ | 99,99 $ - 100,00 $ |
| **Sample Brands** | TRAVOR, LEADSTAR, VBESTLIFE, Senbossi, YOUTHINK, GESUNWE, TECTINTER | TRAVOR, LEADSTAR, VBESTLIFE, Senbossi, YOUTHINK, GESUNWE, TECTINTER | TRAVOR, LEADSTAR, VBESTLIFE, Senbossi, YOUTHINK, GESUNWE, TECTINTER | TRAVOR, LEADSTAR, VBESTLIFE, Senbossi, YOUTHINK, GESUNWE, TECTINTER |
| **Sample Products** | 10-inch Portable Digital TV Player (ALCE1993), 5 Inch Portable TV ISDB-T, 8 Inch LEADSTAR Digital Mini TV, 15.4 Inch Portable Mini Car TV | 10-tommers bærbar digital TV-spiller (ALCE1993), 5 tommer bærbar TV ISDB-T, 8 tommer LEADSTAR digital mini-TV, 15,4 tommer bærbar mini bil-TV | 10-Zoll tragbarer digitaler Fernseher (ALCE1993), 5 Zoll tragbarer TV ISDB-T, 8 Zoll LEADSTAR Digital Mini-TV, 15,4 Zoll tragbarer Mini Auto-TV | Téléviseur numérique portable de 10 pouces (ALCE1993), TV portable 5 pouces ISDB-T, Mini TV numérique LEADSTAR 8 pouces, Mini TV de voiture portable 15,4 pouces |
| **Key Features** | 1080P HD, DVB-T/T2, ISDB-T, ATSC-T support, Rechargeable batteries, Portable design, Car TV compatible | 1080P HD, DVB-T/T2, ISDB-T, ATSC-T støtte, Oppladbare batterier, Bærbart design, Bil-TV kompatibel | 1080P HD, DVB-T/T2, ISDB-T, ATSC-T Unterstützung, Wiederaufladbare Batterien, Tragbares Design, Auto-TV kompatibel | 1080P HD, Support DVB-T/T2, ISDB-T, ATSC-T, Batteries rechargeables, Design portable, Compatible TV de voiture |
| **Screen Sizes** | 5", 8", 10", 12", 14", 15.4", 16" | 5", 8", 10", 12", 14", 15,4", 16" | 5", 8", 10", 12", 14", 15,4", 16" | 5", 8", 10", 12", 14", 15,4", 16" |
| **Filters Available** | Price, Brand, Origin | Pris, Merke, Opprinnelse | Preis, Marke, Herkunft | Prix, Marque, Origine |

---

## 6. Error Scenarios

### 6.1 Invalid Language Codes

| Invalid URL | Expected Redirect | Expected Status Code |
|-------------|-------------------|----------------------|
| `https://example.com/wr-WR/account/dashboard` | `https://example.com/404/` | 404 |
| `https://example.com/xx/products` | `https://example.com/404/` | 404 |
| `https://example.com/zz-ZZ/cart` | `https://example.com/404/` | 404 |
| `https://example.com/ab-CD/checkout` | `https://example.com/404/` | 404 |
| `https://example.com/123/account/dashboard` | `https://example.com/404/` | 404 |
| `https://example.com/d/products` | `https://example.com/404/` | 404 |
| `https://example.com/deut/cart` | `https://example.com/404/` | 404 |

### 6.2 Non-Existent Pages with Valid Language Codes

| Invalid URL | Expected Result | Expected Status Code |
|-------------|-----------------|----------------------|
| `https://example.com/non-existent-page` | 404 Error in Norwegian | 404 |
| `https://example.com/de/non-existent-page` | 404 Error in German | 404 |
| `https://example.com/fr/non-existent-page` | 404 Error in French | 404 |
| `https://example.com/de/products/non-existent-product` | 404 Error in German | 404 |

### 6.3 Malformed Language Codes

| Malformed URL | Expected Result |
|---------------|-----------------|
| `https://example.com/DE/account/dashboard` | Should accept as `de` OR return 404 (document behavior) |
| `https://example.com/de!/account/dashboard` | 404 Error |
| `https://example.com/d-e/account/dashboard` | 404 Error |
| `https://example.com/12/account/dashboard` | 404 Error |

---

## 7. SEO Meta Data Examples

### 7.1 Catalog Page Meta Tags (Actual Implementation)

**Based on actual testing of:** `https://vcst-qa-storefront.govirto.com/fr/catalogue-fr`  
**Test Date:** October 14, 2025

#### French Catalog Page (Actual Found Tags)

```html
<html lang="fr-FR">
<head>
    <title>QA & Catalogue</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="robots" content="noindex" />
    <meta name="keywords" content="fr Catalogue meta keywords" />
    <meta name="description" content="Catalogue fr meta desc" />
    
    <!-- Open Graph Tags (Partial Implementation) -->
    <meta property="og:title" content="QA & Catalogue" />
    <meta property="og:description" content="Catalogue fr meta desc" />    

</head>
```

**SEO Issues Found:**
- ❌ **No canonical URL** - Missing `<link rel="canonical">`
- ❌ **No hreflang tags** - Critical for multilingual SEO
- ⚠️ **Incomplete Open Graph** - Missing og:url, og:type, og:image, og:locale
- ❌ **No Twitter Cards** - Missing all twitter:* meta tags
- ✅ **HTML lang correct** - `fr-FR` properly set
- ✅ **Title localized** - "Catalogue" in French
- ✅ **Meta description present** - French description exists

#### Expected/Recommended Catalog Page SEO Tags

##### English Catalog (Default)

```html
<html lang="en-US">
<head>
    <title>Catalog - B2B Store</title>
    <meta name="description" content="Browse our complete catalog of products across all categories" />
    <meta name="keywords" content="catalog, products, categories, shop" />
    <link rel="canonical" href="https://example.com/catalog" />
    
    <!-- Hreflang Tags -->
    <link rel="alternate" hreflang="en-US" href="https://example.com/catalog" />
    <link rel="alternate" hreflang="no" href="https://example.com/no/katalog" />
    <link rel="alternate" hreflang="de-DE" href="https://example.com/de/katalog" />
    <link rel="alternate" hreflang="fr-FR" href="https://example.com/fr/catalogue" />
    <link rel="alternate" hreflang="it-IT" href="https://example.com/it/catalogo" />
    <link rel="alternate" hreflang="x-default" href="https://example.com/catalog" />
    
    <!-- Open Graph Tags -->
    <meta property="og:title" content="Catalog - B2B Store" />
    <meta property="og:description" content="Browse our complete catalog of products across all categories" />
    <meta property="og:url" content="https://example.com/catalog" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://example.com/images/catalog-og-image.jpg" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:locale:alternate" content="no_NO" />
    <meta property="og:locale:alternate" content="de_DE" />
    <meta property="og:locale:alternate" content="fr_FR" />
    <meta property="og:locale:alternate" content="it_IT" />
    <meta property="og:site_name" content="B2B Store" />
    
    <!-- Twitter Card Tags -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Catalog - B2B Store" />
    <meta name="twitter:description" content="Browse our complete catalog of products across all categories" />
    <meta name="twitter:image" content="https://example.com/images/catalog-twitter-card.jpg" />
</head>
```

##### French Catalog

```html
<html lang="fr-FR">
<head>
    <title>Catalogue - B2B Store</title>
    <meta name="description" content="Parcourez notre catalogue complet de produits dans toutes les catégories" />
    <meta name="keywords" content="catalogue, produits, catégories, boutique" />
    <link rel="canonical" href="https://example.com/fr/catalogue-fr" />
    
    <!-- Hreflang Tags -->
    <link rel="alternate" hreflang="en-US" href="https://example.com/catalog" />
    <link rel="alternate" hreflang="no" href="https://example.com/no/katalog" />
    <link rel="alternate" hreflang="de-DE" href="https://example.com/de/katalog-de" />
    <link rel="alternate" hreflang="fr-FR" href="https://example.com/fr/catalogue-fr" />
    <link rel="alternate" hreflang="it-IT" href="https://example.com/it/catalogo-it" />
    <link rel="alternate" hreflang="x-default" href="https://example.com/catalog" />
    
    <!-- Open Graph Tags -->
    <meta property="og:title" content="Catalogue - B2B Store" />
    <meta property="og:description" content="Parcourez notre catalogue complet de produits dans toutes les catégories" />
    <meta property="og:url" content="https://example.com/fr/catalogue-fr" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://example.com/images/catalog-og-image-fr.jpg" />
    <meta property="og:locale" content="fr_FR" />
    <meta property="og:locale:alternate" content="en_US" />
    <meta property="og:locale:alternate" content="no_NO" />
    <meta property="og:locale:alternate" content="de_DE" />
    <meta property="og:locale:alternate" content="it_IT" />
    <meta property="og:site_name" content="B2B Store" />
    
    <!-- Twitter Card Tags -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Catalogue - B2B Store" />
    <meta name="twitter:description" content="Parcourez notre catalogue complet de produits dans toutes les catégories" />
    <meta name="twitter:image" content="https://example.com/images/catalog-twitter-card-fr.jpg" />
</head>
```

##### German Catalog

```html
<html lang="de-DE">
<head>
    <title>Katalog - B2B Store</title>
    <meta name="description" content="Durchsuchen Sie unseren vollständigen Katalog von Produkten in allen Kategorien" />
    <meta name="keywords" content="katalog, produkte, kategorien, shop" />
    <link rel="canonical" href="https://example.com/de/katalog-de" />
    
    <!-- Hreflang Tags -->
    <link rel="alternate" hreflang="en-US" href="https://example.com/catalog" />
    <link rel="alternate" hreflang="no" href="https://example.com/no/katalog" />
    <link rel="alternate" hreflang="de-DE" href="https://example.com/de/katalog-de" />
    <link rel="alternate" hreflang="fr-FR" href="https://example.com/fr/catalogue-fr" />
    <link rel="alternate" hreflang="it-IT" href="https://example.com/it/catalogo-it" />
    <link rel="alternate" hreflang="x-default" href="https://example.com/catalog" />
    
    <!-- Open Graph Tags -->
    <meta property="og:title" content="Katalog - B2B Store" />
    <meta property="og:description" content="Durchsuchen Sie unseren vollständigen Katalog von Produkten in allen Kategorien" />
    <meta property="og:url" content="https://example.com/de/katalog-de" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://example.com/images/catalog-og-image-de.jpg" />
    <meta property="og:locale" content="de_DE" />
    <meta property="og:locale:alternate" content="en_US" />
    <meta property="og:locale:alternate" content="no_NO" />
    <meta property="og:locale:alternate" content="fr_FR" />
    <meta property="og:locale:alternate" content="it_IT" />
    <meta property="og:site_name" content="B2B Store" />
    
    <!-- Twitter Card Tags -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Katalog - B2B Store" />
    <meta name="twitter:description" content="Durchsuchen Sie unseren vollständigen Katalog von Produkten in allen Kategorien" />
    <meta name="twitter:image" content="https://example.com/images/catalog-twitter-card-de.jpg" />
</head>
```

##### Norwegian Catalog

```html
<html lang="no">
<head>
    <title>Katalog - B2B Store</title>
    <meta name="description" content="Bla gjennom vår komplette katalog av produkter i alle kategorier" />
    <meta name="keywords" content="katalog, produkter, kategorier, butikk" />
    <link rel="canonical" href="https://example.com/no/katalog" />
    
    <!-- Hreflang Tags -->
    <link rel="alternate" hreflang="en-US" href="https://example.com/catalog" />
    <link rel="alternate" hreflang="no" href="https://example.com/no/katalog" />
    <link rel="alternate" hreflang="de-DE" href="https://example.com/de/katalog-de" />
    <link rel="alternate" hreflang="fr-FR" href="https://example.com/fr/catalogue-fr" />
    <link rel="alternate" hreflang="it-IT" href="https://example.com/it/catalogo-it" />
    <link rel="alternate" hreflang="x-default" href="https://example.com/catalog" />
    
    <!-- Open Graph Tags -->
    <meta property="og:title" content="Katalog - B2B Store" />
    <meta property="og:description" content="Bla gjennom vår komplette katalog av produkter i alle kategorier" />
    <meta property="og:url" content="https://example.com/no/katalog" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://example.com/images/catalog-og-image-no.jpg" />
    <meta property="og:locale" content="no_NO" />
    <meta property="og:locale:alternate" content="en_US" />
    <meta property="og:locale:alternate" content="de_DE" />
    <meta property="og:locale:alternate" content="fr_FR" />
    <meta property="og:locale:alternate" content="it_IT" />
    <meta property="og:site_name" content="B2B Store" />
    
    <!-- Twitter Card Tags -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Katalog - B2B Store" />
    <meta name="twitter:description" content="Bla gjennom vår komplette katalog av produkter i alle kategorier" />
    <meta name="twitter:image" content="https://example.com/images/catalog-twitter-card-no.jpg" />
</head>
```

##### Italian Catalog

```html
<html lang="it-IT">
<head>
    <title>Catalogo - B2B Store</title>
    <meta name="description" content="Sfoglia il nostro catalogo completo di prodotti in tutte le categorie" />
    <meta name="keywords" content="catalogo, prodotti, categorie, negozio" />
    <link rel="canonical" href="https://example.com/it/catalogo-it" />
    
    <!-- Hreflang Tags -->
    <link rel="alternate" hreflang="en-US" href="https://example.com/catalog" />
    <link rel="alternate" hreflang="no" href="https://example.com/no/katalog" />
    <link rel="alternate" hreflang="de-DE" href="https://example.com/de/katalog-de" />
    <link rel="alternate" hreflang="fr-FR" href="https://example.com/fr/catalogue-fr" />
    <link rel="alternate" hreflang="it-IT" href="https://example.com/it/catalogo-it" />
    <link rel="alternate" hreflang="x-default" href="https://example.com/catalog" />
    
    <!-- Open Graph Tags -->
    <meta property="og:title" content="Catalogo - B2B Store" />
    <meta property="og:description" content="Sfoglia il nostro catalogo completo di prodotti in tutte le categorie" />
    <meta property="og:url" content="https://example.com/it/catalogo-it" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://example.com/images/catalog-og-image-it.jpg" />
    <meta property="og:locale" content="it_IT" />
    <meta property="og:locale:alternate" content="en_US" />
    <meta property="og:locale:alternate" content="no_NO" />
    <meta property="og:locale:alternate" content="de_DE" />
    <meta property="og:locale:alternate" content="fr_FR" />
    <meta property="og:site_name" content="B2B Store" />
    
    <!-- Twitter Card Tags -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Catalogo - B2B Store" />
    <meta name="twitter:description" content="Sfoglia il nostro catalogo completo di prodotti in tutte le categorie" />
    <meta name="twitter:image" content="https://example.com/images/catalog-twitter-card-it.jpg" />
</head>
```

---

### 7.3 Product Page Structured Data (JSON-LD)

#### German Product Page

```json
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "Kabellose Kopfhörer",
  "description": "Premium Klangqualität",
  "sku": "WH-001",
  "inLanguage": "de",
  "offers": {
    "@type": "Offer",
    "url": "https://example.com/de/products/kabellose-kopfhorer",
    "priceCurrency": "EUR",
    "price": "149.00",
    "availability": "https://schema.org/InStock"
  }
}
```

---

## 8. Local Storage Keys

### Expected Local Storage Structure

| Key | Possible Values | Example Value | Description |
|-----|-----------------|---------------|-------------|
| `language` | `en-US`, `no`, `de`, `fr` | `de` | Selected language code |
| `cultureName` | `en-US`, `no`, `de`, `fr` | `de` | Culture name (may be same as language) |
| `locale` | `en_US`, `no_NO`, `de_DE`, `fr_FR` | `de_DE` | Full locale identifier |
| `preferredLanguage` | `en-US`, `no`, `de`, `fr` | `fr` | User's preferred language |

**Note:** The actual key names may vary depending on the frontend implementation. Document the actual keys found during testing.

### How to Inspect Local Storage

1. Open browser Developer Tools (F12)
2. Navigate to **Application** tab (Chrome/Edge) or **Storage** tab (Firefox)
3. Expand **Local Storage**
4. Click on the domain (e.g., `https://example.com`)
5. Look for language-related keys

---

## 9. Test Execution Notes

### 9.1 Replace Placeholder URLs

Throughout testing, replace `https://example.com` with your actual storefront URL.

**Example:**
- Test URL: `https://example.com/de/products/test-product`
- Actual URL: `https://vcst-qa-storefront.govirto.com/de/products/test-product`

### 9.2 Verify Actual URL Patterns

The URLs in this document use expected patterns. Verify and document the actual URL patterns used in your implementation:

- [ ] Are language codes lowercase (`/de/`) or uppercase (`/DE/`)? **Answer:** _________
- [ ] Are slugs localized (`/de/über-uns`) or English (`/de/account/dashboard`)? **Answer:** _________
- [ ] Is the cart URL localized (`/de/warenkorb`) or English (`/de/cart`)? **Answer:** _________
- [ ] Does the default language (English) use a prefix or not? **Answer:** No prefix (verified)

### 9.3 Document Deviations

If the actual implementation differs from this test data, document the differences here:

| Expected | Actual | Notes |
|----------|--------|-------|
| `/de/über-uns` | ___________ | _______ |
| `/fr/à-propos` | ___________ | _______ |
| `/de/warenkorb` | ___________ | _______ |

---

## 10. Quick Reference Checklist

### URLs to Test (Minimum Set)

- [ ] `https://example.com/` (Home - English)
- [ ] `https://example.com/no/` (Home - Norwegian)
- [ ] `https://example.com/de/` (Home - German)
- [ ] `https://example.com/fr/` (Home - French)
- [ ] `https://example.com/account/dashboard` (Dashboard - English)
- [ ] `https://example.com/no/account/dashboard` (Dashboard - Norwegian)
- [ ] `https://example.com/de/account/dashboard` (Dashboard - German)
- [ ] `https://example.com/fr/account/dashboard` (Dashboard - French)
- [ ] `https://example.com/products/test-product` (Product - English)
- [ ] `https://example.com/no/products/test-product` (Product - Norwegian)
- [ ] `https://example.com/de/products/test-product` (Product - German)
- [ ] `https://example.com/fr/products/test-product` (Product - French)
- [ ] `https://example.com/cart` (Cart - English)
- [ ] `https://example.com/no/cart` (Cart - Norwegian)
- [ ] `https://example.com/de/cart` (Cart - German)
- [ ] `https://example.com/fr/cart` (Cart - French)
- [ ] `https://example.com/wr-WR/invalid` (Invalid language code)
- [ ] `https://example.com/sitemap.xml` (Sitemap)

---

**End of Test Data Reference**

