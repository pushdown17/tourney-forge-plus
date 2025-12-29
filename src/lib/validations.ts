import { z } from "zod";

// Team validation schema
export const teamSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "Team name is required")
    .max(100, "Team name must be less than 100 characters"),
  tournament_id: z.string().uuid("Invalid tournament ID"),
  group_name: z.string().optional(),
});

// Player validation schema
export const playerSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "Player name is required")
    .max(100, "Player name must be less than 100 characters"),
  team_id: z.string().uuid("Invalid team ID"),
});

// Match score validation schema
export const matchScoreSchema = z.object({
  team1_score: z.number()
    .int("Score must be an integer")
    .min(0, "Score cannot be negative")
    .max(999, "Score cannot exceed 999"),
  team2_score: z.number()
    .int("Score must be an integer")
    .min(0, "Score cannot be negative")
    .max(999, "Score cannot exceed 999"),
});

// Player stats validation schema
export const playerStatsSchema = z.object({
  player_id: z.string().uuid("Invalid player ID"),
  tournament_id: z.string().uuid("Invalid tournament ID"),
  match_id: z.string().uuid("Invalid match ID").optional().nullable(),
  goals: z.number()
    .int("Goals must be an integer")
    .min(0, "Goals cannot be negative")
    .max(999, "Goals cannot exceed 999"),
  assists: z.number()
    .int("Assists must be an integer")
    .min(0, "Assists cannot be negative")
    .max(999, "Assists cannot exceed 999"),
  fouls: z.number()
    .int("Fouls must be an integer")
    .min(0, "Fouls cannot be negative")
    .max(99, "Fouls cannot exceed 99"),
  penalty_30s: z.number()
    .int("Penalties must be an integer")
    .min(0, "Penalties cannot be negative")
    .max(99, "Penalties cannot exceed 99"),
  penalty_1m: z.number()
    .int("Penalties must be an integer")
    .min(0, "Penalties cannot be negative")
    .max(99, "Penalties cannot exceed 99"),
  penalty_2m: z.number()
    .int("Penalties must be an integer")
    .min(0, "Penalties cannot be negative")
    .max(99, "Penalties cannot exceed 99"),
});

export type TeamInput = z.infer<typeof teamSchema>;
export type PlayerInput = z.infer<typeof playerSchema>;
export type MatchScoreInput = z.infer<typeof matchScoreSchema>;
export type PlayerStatsInput = z.infer<typeof playerStatsSchema>;
