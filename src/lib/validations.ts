import { z } from "zod";

// Team validation schema
export const teamSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "Le nom de l'équipe est requis")
    .max(100, "Le nom de l'équipe doit faire moins de 100 caractères"),
  tournament_id: z.string().uuid("ID de tournoi invalide"),
  group_name: z.string().optional(),
});

// Player validation schema
export const playerSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "Le nom du joueur est requis")
    .max(100, "Le nom du joueur doit faire moins de 100 caractères"),
  team_id: z.string().uuid("ID d'équipe invalide"),
});

// Match score validation schema
export const matchScoreSchema = z.object({
  team1_score: z.number()
    .int("Le score doit être un nombre entier")
    .min(0, "Le score ne peut pas être négatif")
    .max(999, "Le score ne peut pas dépasser 999"),
  team2_score: z.number()
    .int("Le score doit être un nombre entier")
    .min(0, "Le score ne peut pas être négatif")
    .max(999, "Le score ne peut pas dépasser 999"),
});

// Player stats validation schema
export const playerStatsSchema = z.object({
  player_id: z.string().uuid("ID de joueur invalide"),
  tournament_id: z.string().uuid("ID de tournoi invalide"),
  match_id: z.string().uuid("ID de match invalide").optional().nullable(),
  goals: z.number()
    .int("Les buts doivent être un nombre entier")
    .min(0, "Les buts ne peuvent pas être négatifs")
    .max(999, "Les buts ne peuvent pas dépasser 999"),
  assists: z.number()
    .int("Les passes doivent être un nombre entier")
    .min(0, "Les passes ne peuvent pas être négatives")
    .max(999, "Les passes ne peuvent pas dépasser 999"),
  fouls: z.number()
    .int("Les fautes doivent être un nombre entier")
    .min(0, "Les fautes ne peuvent pas être négatives")
    .max(99, "Les fautes ne peuvent pas dépasser 99"),
  penalty_30s: z.number()
    .int("Les pénalités doivent être un nombre entier")
    .min(0, "Les pénalités ne peuvent pas être négatives")
    .max(99, "Les pénalités ne peuvent pas dépasser 99"),
  penalty_1m: z.number()
    .int("Les pénalités doivent être un nombre entier")
    .min(0, "Les pénalités ne peuvent pas être négatives")
    .max(99, "Les pénalités ne peuvent pas dépasser 99"),
  penalty_2m: z.number()
    .int("Les pénalités doivent être un nombre entier")
    .min(0, "Les pénalités ne peuvent pas être négatives")
    .max(99, "Les pénalités ne peuvent pas dépasser 99"),
});

export type TeamInput = z.infer<typeof teamSchema>;
export type PlayerInput = z.infer<typeof playerSchema>;
export type MatchScoreInput = z.infer<typeof matchScoreSchema>;
export type PlayerStatsInput = z.infer<typeof playerStatsSchema>;
