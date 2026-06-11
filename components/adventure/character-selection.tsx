"use client";

import {
  textShadow,
  textShadowSpreadLight,
} from "@/components/typography/styles";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getImageUrl } from "@/lib/utils";
import type { TurnCharacter } from "@/types/adventure";
import type { AdventurePlan } from "@/types/adventure-plan";
import type { PCTemplate } from "@/types/character";
import { Eye } from "lucide-react";
import Image from "@/components/ui/native-image";
import Link from "next/link";
import React, { useState } from "react";
import PartyConfiguration from "./PartyConfiguration";
import { CharacterSheetModal } from "./character-sheet-modal";

interface CharacterSelectionProps {
  adventurePlan: AdventurePlan;
  settingId: string;
  adventurePlanId: string;
}

export type CharacterChoiceMode = {
  characterId: string;
  mode: "player" | "invite" | "ai";
};

function convertToTurnCharacter(pcTemplate: PCTemplate): TurnCharacter {
  return {
    ...pcTemplate,
    type: "pc" as const,
    userId: "", // Empty for template
    initiative: 0, // Default value
    hasReplied: false,
    isComplete: false,
  };
}

export default function CharacterSelection({
  adventurePlan,
}: CharacterSelectionProps) {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null
  );
  const [characterChoices, setCharacterChoices] = useState<
    CharacterChoiceMode[]
  >([]);
  const [modalCharacter, setModalCharacter] = useState<TurnCharacter | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);

  const characterNames = Object.fromEntries(
    adventurePlan.premadePlayerCharacters.map((char) => [char.id, char.name])
  );

  // Initialize character choices when a character is selected
  React.useEffect(() => {
    if (selectedCharacterId && characterChoices.length === 0) {
      const choices: CharacterChoiceMode[] =
        adventurePlan.premadePlayerCharacters.map((char, index) => ({
          characterId: char.id,
          mode:
            index === 0 && char.id === selectedCharacterId ? "player" : "ai",
        }));
      setCharacterChoices(choices);
    }
  }, [
    selectedCharacterId,
    characterChoices.length,
    adventurePlan.premadePlayerCharacters,
  ]);

  const handleCharacterSelect = (characterId: string) => {
    setIsSelecting(true);
    setSelectedCharacterId(characterId);
    // Reset choices and set the selected character as player, others as AI
    const choices: CharacterChoiceMode[] =
      adventurePlan.premadePlayerCharacters.map((char) => ({
        characterId: char.id,
        mode: char.id === characterId ? "player" : "ai",
      }));
    setCharacterChoices(choices);
    // Simulate async feedback, reset after short delay
    setTimeout(() => setIsSelecting(false), 600);
  };

  const handleViewCharacterSheet = (
    character: PCTemplate,
    e: React.MouseEvent
  ) => {
    e.stopPropagation(); // Prevent character selection when clicking view details
    setModalCharacter(convertToTurnCharacter(character));
    setIsModalOpen(true);
  };

  return (
    <div
      className="min-h-screen relative"
      style={{
        backgroundImage: `url(${getImageUrl(adventurePlan.image)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Background overlay for better readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/60 to-black/30" />

      <div className="container max-w-5xl mx-auto px-6 sm:px-8 pt-24 sm:pt-20 pb-8 relative z-10">
        <div className="text-center mb-3 rounded border border-white/15 bg-black/35 px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur-sm">
          <h1
            style={textShadowSpreadLight}
            className="text-3xl md:text-4xl font-bold font-display mb-1 text-white leading-tight"
          >
            {adventurePlan.title}
          </h1>
          <p
            style={textShadow}
            className="max-w-3xl mx-auto relative z-10 text-indigo-100 text-sm md:text-base !text-balance"
          >
            {adventurePlan.teaser}
          </p>
        </div>
        {adventurePlan.availableCharacterOptions && (
          <div className="flex flex-col items-center justify-center gap-4">
            {adventurePlan.premadePlayerCharacters &&
              adventurePlan.premadePlayerCharacters.length > 0 && (
                <p
                  className="font-display w-full text-center text-xl text-amber-300 font-bold mb-6"
                  style={textShadow}
                >
                  CreatE a CharacteR
                </p>
              )}

            <Button
              asChild
              variant="epic"
              size="lg"
              className={cn(
                !adventurePlan.premadePlayerCharacters ||
                  (adventurePlan.premadePlayerCharacters.length === 0 &&
                    "text-xl px-12 py-4")
              )}
            >
              <Link
                href={`/settings/${adventurePlan.settingId}/${adventurePlan.id}/character-create`}
              >
                Create Character
              </Link>
            </Button>
          </div>
        )}
        {adventurePlan.premadePlayerCharacters &&
          adventurePlan.premadePlayerCharacters.length > 0 && (
            <div>
              <p
                className="font-display w-full text-center text-xl text-amber-300 font-bold mb-6"
                style={textShadow}
              >
                ChoosE Your characteR
              </p>
              <div
                className={cn(
                  "grid gap-6 mb-8 max-w-4xl mx-auto",
                  adventurePlan.premadePlayerCharacters.length === 1
                    ? "grid-cols-1 justify-items-center"
                    : "grid-cols-1 md:grid-cols-2"
                )}
              >
                {adventurePlan.premadePlayerCharacters.map((character) => (
                  <Card
                    key={character.id}
                    className={cn(
                      "w-full bg-black/80 border-white/20 scale-95 hover:scale-100 hover:bg-black/90 ring-4 ring-black transition-all duration-500 ease-in-out p-0 overflow-hidden cursor-pointer flex flex-col",
                      adventurePlan.premadePlayerCharacters.length === 1 &&
                        "max-w-md",
                      selectedCharacterId === character.id
                        ? "ring-8 ring-primary-500 scale-100"
                        : "hover:ring-8 hover:ring-primary-500",
                      isSelecting && "pointer-events-none opacity-60 grayscale"
                    )}
                    onClick={() =>
                      !isSelecting && handleCharacterSelect(character.id)
                    }
                    aria-disabled={isSelecting}
                  >
                    <div className="pb-2 relative aspect-[1.25] w-full">
                      {/* View Details Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="absolute top-2 right-2 z-20 font-display text-sm"
                        onClick={(e) => handleViewCharacterSheet(character, e)}
                        disabled={isSelecting}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Details
                      </Button>
                      {/* Overlay spinner/feedback if selecting this card */}
                      {isSelecting && selectedCharacterId === character.id && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-30">
                          <svg
                            className="animate-spin h-8 w-8 text-amber-300 mr-2"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v8z"
                            />
                          </svg>
                          <span className="text-amber-300 font-bold text-lg">
                            Selecting...
                          </span>
                        </div>
                      )}

                      <div
                        style={textShadow}
                        className="absolute bottom-2 left-0 right-0 text-white w-full text-center font-display text-2xl z-10"
                      >
                        <div className="font-bold text-amber-300 pb-1">
                          {character.name}
                        </div>
                        <div className="text-base">
                          {character.gender} {character.race}{" "}
                          {character.archetype}
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black to-transparent z-[9]" />
                      {character.image && (
                        <Image
                          src={getImageUrl(character.image)}
                          alt={character.name}
                          fill
                          className="object-cover"
                        />
                      )}
                    </div>
                    <CardContent className="flex-1 flex flex-col">
                      <div className="relative z-10 flex-1 flex flex-col">
                        {character.background && (
                          <div className="text-gray-300 text-sm -mt-2 mb-3 whitespace-pre-line">
                            {character.background}
                          </div>
                        )}
                        <div className="w-full flex justify-center pt-2 pb-8 mt-auto">
                          <Button
                            variant="outline"
                            size="lg"
                            className="text-lg w-36"
                            disabled={isSelecting}
                          >
                            {isSelecting &&
                            selectedCharacterId === character.id ? (
                              <span>Selecting...</span>
                            ) : selectedCharacterId === character.id ? (
                              "Selected"
                            ) : (
                              "Select"
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-tl from-black/50 to-transparent" />
                    </CardContent>
                  </Card>
                ))}
              </div>

              {!selectedCharacterId && (
                <p className="text-center text-lg text-indigo-200 pb-8">
                  {adventurePlan.premadePlayerCharacters.length === 1
                    ? "This intro adventure uses a premade character. Click to select and continue."
                    : "This intro adventure uses premade characters. Please select your character to continue."}
                </p>
              )}

              {selectedCharacterId && characterChoices.length > 0 && (
                <PartyConfiguration
                  characterChoices={characterChoices}
                  onModeChange={(characterId, mode) => {
                    setCharacterChoices((prev) =>
                      prev.map((choice) =>
                        choice.characterId === characterId
                          ? { ...choice, mode }
                          : choice
                      )
                    );
                  }}
                  characterNames={characterNames}
                />
              )}
            </div>
          )}

        <CharacterSheetModal
          character={modalCharacter}
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
        />
      </div>
    </div>
  );
}
