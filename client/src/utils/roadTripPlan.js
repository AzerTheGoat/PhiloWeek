export const ROAD_TRIP_CATEGORIES = {
  food: 'Manger', water: 'Eau', supplies: 'Ravitaillement', fuel: 'Carburant',
  charging: 'Recharge', sleep: 'Dormir', medical: 'Santé', parking: 'Stationnement',
  transport: 'Transport', visit: 'À voir', activity: 'Activité', viewpoint: 'Point de vue',
  warning: 'Vigilance', practical: 'Pratique', other: 'Autre',
}

export const ROAD_TRIP_PLAN_PROMPT = `Tu es un planificateur de voyage rigoureux. Nous avons défini ensemble un trajet. Convertis maintenant ce trajet en UN SEUL objet JSON directement importable dans Opuscule.

RÈGLES ABSOLUES
- Réponds uniquement avec du JSON valide, sans Markdown, sans commentaire et sans bloc \`\`\`.
- N'invente jamais une adresse, des horaires, un prix, un téléphone, une route ou une source. Mets null si l'information n'est pas fiable.
- Pour toute information susceptible de changer, indique source_url, verified_on au format YYYY-MM-DD et confidence parmi high, medium, low.
- Utilise des coordonnées décimales WGS84 exactes. lat est entre -90 et 90, lng entre -180 et 180.
- Fais un plan réaliste selon les dates, le mode de déplacement, le rythme, le budget et les contraintes déjà définis dans notre conversation.
- Ajoute le maximum de lieux réellement utiles sans doublons : repas, eau, ravitaillement, carburant/recharge, couchage, santé, stationnement, transports, visites, activités, points de vue, zones de vigilance.
- Les conseils de sécurité, météo, frontières, fermetures et horaires restent à vérifier avant le départ. Signale explicitement les hypothèses et incertitudes.
- Pas d'image, pas de data URI, pas de texte hors JSON.

SCHÉMA À PRODUIRE
{
  "philoweek_type": "road_trip_plan",
  "version": 1,
  "trip": {
    "title": "string",
    "description": "string",
    "status": "planned",
    "tag": "string ou null",
    "color": "#e8663f",
    "start_date": "YYYY-MM-DD ou null",
    "end_date": "YYYY-MM-DD ou null",
    "distance_km": "nombre réaliste ou null",
    "elevation_m": "dénivelé positif en mètres ou null",
    "summary": "résumé clair de l'esprit, du rythme et des principaux arbitrages",
    "traveler_profile": {
      "travelers": "nombre ou null",
      "mode": "car, van, motorcycle, bicycle, hiking, train, mixed ou autre",
      "pace": "string ou null",
      "budget": "string ou null",
      "interests": ["string"],
      "constraints": ["string"]
    },
    "points": [
      { "key": "stop-1", "name": "Nom de l'étape", "lat": 0, "lng": 0, "note": "raison de l'étape et conseil essentiel" }
    ],
    "track": [
      { "lat": 0, "lng": 0 }
    ],
    "segments": [
      {
        "from": "stop-1", "to": "stop-2", "mode": "car",
        "distance_km": 0, "duration_minutes": 0,
        "route": "axes, sentiers ou lignes utiles, sans inventer",
        "road_conditions": "string ou null", "tolls": "string ou null",
        "advice": ["pauses, meilleur horaire, saison, conduite, difficulté"],
        "warnings": ["risques et vérifications nécessaires"]
      }
    ],
    "days": [
      {
        "day": 1, "date": "YYYY-MM-DD ou null", "title": "string",
        "start_point": "stop-1", "end_point": "stop-2",
        "distance_km": 0, "duration_minutes": 0,
        "morning": ["string"], "afternoon": ["string"], "evening": ["string"],
        "meals": ["string"], "sleep": "string ou null", "notes": ["string"]
      }
    ],
    "places": [
      {
        "title": "Nom précis", "category": "food|water|supplies|fuel|charging|sleep|medical|parking|transport|visit|activity|viewpoint|warning|practical|other",
        "lat": 0, "lng": 0,
        "body": "pourquoi ce lieu est utile, quoi y faire ou acheter, alternatives et limite connue",
        "importance": "essential|recommended|optional",
        "address": "string ou null", "opening_hours": "string ou null",
        "price": "string ou null", "phone": "string ou null", "website": "URL ou null",
        "source_url": "URL de vérification ou null", "verified_on": "YYYY-MM-DD ou null",
        "confidence": "high|medium|low", "best_time": "string ou null",
        "reservation": "string ou null", "accessibility": "string ou null",
        "supplies": ["produits ou services utiles"], "warnings": ["string"],
        "tags": ["string"], "linked_point_key": "stop-1 ou null"
      }
    ],
    "practical": {
      "budget": { "currency": "EUR", "total_estimate": null, "breakdown": ["string"] },
      "weather_and_season": ["conditions probables et quoi vérifier"],
      "documents_and_rules": ["documents, péages, frontières, réglementations"],
      "health_and_safety": ["urgences, couverture réseau, risques, numéros utiles vérifiés"],
      "connectivity": ["réseau, cartes hors ligne, recharge"],
      "packing": ["équipement adapté au trajet"],
      "alternatives": ["plans B réalistes"]
    },
    "checklist": ["actions concrètes à faire avant le départ"],
    "sources": [{ "title": "string", "url": "URL", "verified_on": "YYYY-MM-DD" }],
    "assumptions": ["tout point supposé, non confirmé ou dépendant de la date"]
  }
}

La liste points doit contenir au moins 2 étapes. track est optionnel mais, s'il est fourni, doit contenir une géométrie ordonnée suffisamment détaillée pour dessiner la route; sinon l'application reliera les étapes par des lignes droites. Retourne maintenant le JSON final correspondant exactement au trajet défini dans notre conversation.`
