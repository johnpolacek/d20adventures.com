import { useGenerateObject } from "@/app/_hooks/useGenerateObject";
import { rollRequirementSchema } from "@/lib/validations/roll-requirement-schema";

export function useRollRequirement() {
  const { object: roll, isLoading, error, generate } = useGenerateObject("/api/ai/get-roll-requirement", rollRequirementSchema);

  // Alias generate to generateRoll for clarity
  const generateRoll = generate;

  return { roll, isLoading, error, generateRoll };
} 