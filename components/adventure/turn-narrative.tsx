"use client";

import { advanceTurn } from "@/app/_actions/advance-turn";
import { ensureNpcProcessed } from "@/app/_actions/ensure-npc-processed";
import { processTurnReply } from "@/app/_actions/adventure";
import CharacterDiceRollResultDisplay from "@/components/adventure/character-dice-roll-result-display";
import TurnAdvanceButton from "@/components/adventure/turn-advance-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdventure } from "@/lib/context/AdventureContext";
import { useTurnContext } from "@/lib/context/TurnContext";
import { cn } from "@/lib/utils";
import { parseNarrative } from "@/lib/utils/parse-narrative";
import type { TurnCharacter } from "@/types/adventure";
import { useUser } from "@clerk/nextjs";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import React from "react";
import LoadingAnimation from "../ui/loading-animation";
import { scrollToBottom } from "../ui/utils";
import FinalEncounterCompleteMessage from "./final-encounter-complete-message";
import TurnNarrativeReply from "./turn-narrative-reply";

export default function TurnNarrative({
  nextAdventure,
}: {
  nextAdventure?: string;
}) {
  const params = useParams();
  const router = useRouter();
  const { currentTurn, disableSSE } = useTurnContext();
  const { settingId, adventurePlanId } = useAdventure();
  const { isSignedIn, user } = useUser();
  const [advancing, setAdvancing] = React.useState(false);
  const [initialNarrative, setInitialNarrative] = React.useState("");
  const [tokenError, setTokenError] = React.useState<string | null>(null);
  const [showOriginalReplies, setShowOriginalReplies] = React.useState(false);

  useEffect(() => {
    // scroll to bottom of page when currentTurn.narrative changes after the first render
    if (currentTurn?.narrative) {
      if (!initialNarrative) {
        setInitialNarrative(currentTurn.narrative);
      } else if (initialNarrative !== currentTurn.narrative && !disableSSE) {
        scrollToBottom();
      }
    }
  }, [currentTurn?.narrative, disableSSE, initialNarrative]);

  // Auto-navigate when turn is advanced by another player (only if on last turn)
  useEffect(() => {
    if (disableSSE || !currentTurn) return;

    const urlTurnOrder = params.turnOrder
      ? Number.parseInt(params.turnOrder as string, 10)
      : null;
    if (urlTurnOrder === null) return;

    // Access order field (available at runtime from Convex)
    const currentTurnOrder = (currentTurn as { order?: number }).order;
    if (!currentTurnOrder) return;

    // Only navigate if user was on the last turn and a new turn was just added
    // If currentTurnOrder === urlTurnOrder + 1, that means:
    // - User was on turn N (the last turn)
    // - A new turn N+1 was just created
    // - We should navigate to N+1
    if (currentTurnOrder === urlTurnOrder + 1) {
      const basePath = `/settings/${settingId}/${adventurePlanId}/${params.adventureId}`;
      router.replace(`${basePath}/${currentTurnOrder}`, { scroll: false });
    }
  }, [
    currentTurn,
    params.turnOrder,
    params.adventureId,
    settingId,
    adventurePlanId,
    disableSSE,
    router,
  ]);

  const isTurnComplete = currentTurn?.characters.every(
    (c: TurnCharacter) => c.isComplete
  );

  if (!currentTurn) {
    return null;
  }

  // Sort characters by initiative (highest first) and find the current actor
  const charactersByInitiative = (currentTurn?.characters || [])
    .slice()
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));

  // Find the current actor: highest initiative, not complete, and not dead
  const currentCharacter = charactersByInitiative.find(
    (c: TurnCharacter) =>
      !c.isComplete && c.healthPercent !== 0 && c.status !== "dead"
  );

  // Log turn state for debugging
  React.useEffect(() => {
    if (currentTurn) {
      console.log("[TurnNarrative] Turn state:", {
        turnId: currentTurn.id,
        turnOrder: (currentTurn as { order?: number }).order,
        characterCount: currentTurn.characters.length,
        characters: currentTurn.characters.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          initiative: c.initiative,
          hasReplied: c.hasReplied,
          isComplete: c.isComplete,
          healthPercent: c.healthPercent,
          status: c.status,
        })),
        currentCharacter: currentCharacter
          ? {
              id: currentCharacter.id,
              name: currentCharacter.name,
              type: currentCharacter.type,
              hasReplied: currentCharacter.hasReplied,
              isComplete: currentCharacter.isComplete,
            }
          : null,
        isTurnComplete,
        disableSSE,
      });
    }
  }, [currentTurn, currentCharacter, isTurnComplete, disableSSE]);

  // Check if we're waiting for an NPC to process their turn
  const isNpcProcessing =
    currentCharacter &&
    currentCharacter.type === "npc" &&
    !currentCharacter.hasReplied;

  // Trigger NPC processing when an NPC turn is detected
  React.useEffect(() => {
    if (
      !disableSSE &&
      currentTurn &&
      isNpcProcessing &&
      currentCharacter &&
      !currentTurn.isFinalEncounter
    ) {
      console.log(
        "[TurnNarrative] Detected NPC turn, triggering ensureNpcProcessed:",
        {
          turnId: currentTurn.id,
          npcId: currentCharacter.id,
          npcName: currentCharacter.name,
          hasReplied: currentCharacter.hasReplied,
          isComplete: currentCharacter.isComplete,
        }
      );
      ensureNpcProcessed(currentTurn.id as Id<"turns">)
        .then((result) => {
          console.log("[TurnNarrative] ensureNpcProcessed result:", result);
        })
        .catch((error) => {
          console.error(
            "[TurnNarrative] Error calling ensureNpcProcessed:",
            error
          );
        });
    }
  }, [currentTurn, isNpcProcessing, currentCharacter, disableSSE]);

  const parsed = parseNarrative(currentTurn?.narrative || "");

  const shouldShowReplyCondition =
    currentTurn &&
    !currentTurn.isFinalEncounter &&
    currentCharacter &&
    currentCharacter.type === "pc" &&
    currentCharacter.userId === user?.id &&
    !isNpcProcessing &&
    !disableSSE &&
    currentCharacter.healthPercent !== 0;

  // Find the player's character and check if their turn is complete
  const playerCharacter = currentTurn?.characters.find(
    (c: TurnCharacter) => c.type === "pc" && c.userId === user?.id
  );
  const isPlayerTurnComplete = playerCharacter?.isComplete;

  // Check if all PCs are dead
  const pcs =
    currentTurn?.characters.filter((c: TurnCharacter) => c.type === "pc") || [];
  const allPCsDead = pcs.length > 0 && pcs.every((c) => c.healthPercent === 0);

  const handleAdvanceOrNavigate = async () => {
    if (disableSSE) {
      // Navigation mode: just go to the next turn
      const currentTurnOrder = params.turnOrder
        ? Number.parseInt(params.turnOrder as string, 10)
        : 1;
      const nextTurnOrder = currentTurnOrder + 1;
      const basePath = `/settings/${settingId}/${adventurePlanId}/${params.adventureId}`;

      setAdvancing(true);
      router.push(`${basePath}/${nextTurnOrder}`);
      // Reset advancing state after a delay since navigation doesn't complete immediately
      setTimeout(() => setAdvancing(false), 1000);
    } else {
      setAdvancing(true);
      setTokenError(null); // Clear previous errors
      try {
        const result = await advanceTurn({
          turnId: currentTurn?.id as Id<"turns">,
          settingId,
          adventurePlanId,
        });

        // Navigate to the new turn URL after successful advancement
        if (result.status === "turn_advanced") {
          const currentTurnOrder = params.turnOrder
            ? Number.parseInt(params.turnOrder as string, 10)
            : 1;
          const newTurnOrder = currentTurnOrder + 1;
          const basePath = `/settings/${settingId}/${adventurePlanId}/${params.adventureId}`;
          router.replace(`${basePath}/${newTurnOrder}`, { scroll: false });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "";

        // Check for race condition: another user already advanced this turn
        const expectedTurnOrder = params.turnOrder
          ? Number.parseInt(params.turnOrder as string, 10)
          : 1;
        const currentTurnOrder = currentTurn
          ? (currentTurn as { order?: number }).order
          : undefined;
        const turnAlreadyAdvanced =
          currentTurnOrder !== undefined &&
          currentTurnOrder > expectedTurnOrder;

        // Known race-condition error messages
        const isRaceConditionError =
          errorMessage.includes("Turn not found") ||
          errorMessage.includes("Turn already") ||
          errorMessage.includes("order mismatch");

        if (turnAlreadyAdvanced || isRaceConditionError) {
          // Another user already advanced - navigate silently to the current turn
          const basePath = `/settings/${settingId}/${adventurePlanId}/${params.adventureId}`;
          if (turnAlreadyAdvanced && currentTurnOrder !== undefined) {
            router.replace(`${basePath}/${currentTurnOrder}`, {
              scroll: false,
            });
          } else {
            router.refresh();
          }
          return;
        }

        // Show actual errors
        if (errorMessage.includes("Insufficient tokens")) {
          setTokenError(
            "You do not have enough tokens to perform this action. Please add more tokens to your account."
          );
        } else {
          setTokenError(
            "An unexpected error occurred while advancing the turn. Please try again."
          );
        }
      } finally {
        setAdvancing(false);
      }
    }
  };

  return (
    <div className="grow max-w-2xl fade-in">
      {tokenError && (
        <Alert variant="destructive" className="mb-8">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Action Failed</AlertTitle>
          <AlertDescription>{tokenError}</AlertDescription>
        </Alert>
      )}
      {shouldShowReplyCondition && (
        <div className="hidden md:flex fade-in justify-between items-center gap-4 px-4 h-14 -mt-18 mb-4 bg-black/70 rounded-lg border border-white/20">
          <p className="italic text-sm pl-2 font-bold text-amber-300">
            It is your turn!
          </p>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => scrollToBottom()}
          >
            Go To Reply
          </Button>
        </div>
      )}
      {parsed.map((part, idx) => {
        if (part.type === "original-reply") {
          if (!showOriginalReplies) return null;
          return (
            <div
              key={`original-${idx}`}
              className="text-base italic text-primary-200 mb-6 whitespace-pre-line"
            >
              Player Reply: {part.value}
            </div>
          );
        }
        if (part.type === "paragraph") {
          return (
            <p
              key={idx}
              className="text-sm sm:text-base md:text-lg whitespace-pre-line mb-4"
            >
              {part.value}
            </p>
          );
        }
        // Use a more unique key if available, otherwise fallback to idx
        const key = part.character
          ? `${part.character}-${part.rollType}-${part.result}-${part.difficulty}`
          : idx;
        return (
          <div className="pb-6" key={key}>
            <CharacterDiceRollResultDisplay
              character={part.character}
              rollType={part.rollType}
              difficulty={part.difficulty}
              result={part.result}
              image={part.image}
              modifier={part.modifier}
              baseRoll={part.baseRoll}
            />
          </div>
        );
      })}

      {/* Show loading animation if an NPC is processing their turn */}
      {isNpcProcessing && !currentTurn?.isFinalEncounter && !disableSSE && (
        <div className="flex flex-col items-center gap-4 py-8">
          <LoadingAnimation />
          <p className="text-indigo-300 font-display">
            {currentCharacter.name} is rolling…
          </p>
        </div>
      )}

      {/* Show reply form only if current character is a PC and not in historical mode */}
      {shouldShowReplyCondition ? (
        <TurnNarrativeReply
          character={currentCharacter!}
          submitReply={async ({
            turnId,
            characterId,
            narrativeAction,
            originalPlayerInput,
          }) => {
            setTokenError(null); // Clear previous errors
            try {
              // Cast turnId to Id<'turns'>
              const result = await processTurnReply({
                turnId: turnId as Id<"turns">,
                characterId,
                narrativeAction,
                originalPlayerInput,
              });
              return result;
            } catch (error) {
              if (
                error instanceof Error &&
                error.message.includes("Insufficient tokens")
              ) {
                setTokenError(
                  "You do not have enough tokens to perform this action. Please add more tokens to your account."
                );
              } else if (error instanceof Error) {
                // Handle other specific errors from processTurnReply if needed
                setTokenError(error.message); // Display the error message from the caught error
              } else {
                setTokenError(
                  "An unexpected error occurred while processing your action. Please try again."
                );
              }
              // When an error occurs, you might want to throw it or return a specific structure
              // to let TurnNarrativeReply know that the submission failed.
              // For now, it will fall through and TurnNarrativeReply might proceed as if successful depending on its logic.
              // Consider throwing the error to be caught by TurnNarrativeReply's own error handling if it has one.
              throw error; // Re-throw the error so TurnNarrativeReply can also handle it if needed
            }
          }}
        />
      ) : allPCsDead ? (
        <div
          id="turn-indicator"
          className="flex flex-col gap-2 justify-center border mt-6 border-red-800/50 items-center p-8 rounded-lg bg-red-900/20"
        >
          <h4 className="text-xl font-display text-red-400">Game Over</h4>
          <p className="italic text-red-300">
            All player characters have fallen
          </p>
          <Link href={`/settings/${settingId}/play`} className="mt-4">
            <Button variant="epic" size="sm" className="text-sm">
              Return to Setting
            </Button>
          </Link>
        </div>
      ) : !currentTurn?.isFinalEncounter ? (
        <div
          id="turn-indicator"
          className={cn(
            "flex flex-col gap-2 justify-center border mt-4 border-white/20 items-center p-8 rounded-lg",
            isPlayerTurnComplete
              ? "bg-neutral-900"
              : "bg-primary-800/70 border-dashed",
            isTurnComplete && "hidden"
          )}
        >
          <h4
            className={cn(
              "text-xl font-display",
              isPlayerTurnComplete ? "text-green-300/70" : "text-primary-200"
            )}
          >
            {isPlayerTurnComplete
              ? "Your Turn is Complete"
              : "Waiting for Your Turn"}
          </h4>
          <div className="flex gap-3 mt-3 mb-4 scale-75">
            <span
              className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                isPlayerTurnComplete ? "bg-neutral-600" : "bg-primary-200"
              )}
              style={{ animationDelay: "0ms", animationDuration: "2s" }}
            />
            <span
              className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                isPlayerTurnComplete ? "bg-neutral-600" : "bg-primary-200"
              )}
              style={{ animationDelay: "200ms", animationDuration: "2s" }}
            />
            <span
              className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                isPlayerTurnComplete ? "bg-neutral-600" : "bg-primary-200"
              )}
              style={{ animationDelay: "400ms", animationDuration: "2s" }}
            />
          </div>
          <p className="italic text-white/70">
            It is currently {currentCharacter?.name}&apos;s turn
          </p>
        </div>
      ) : null}

      {currentTurn?.isFinalEncounter && (
        <div className="flex flex-col items-center justify-center mt-8 md:mt-16 text-center px-2 py-4 md:py-6 border-double border-8 border-primary-800 rounded-lg">
          <FinalEncounterCompleteMessage
            isSignedIn={Boolean(isSignedIn)}
            settingId={settingId}
            adventurePlanId={adventurePlanId}
            nextAdventure={nextAdventure}
          />
        </div>
      )}
      {isTurnComplete && !currentTurn?.isFinalEncounter && (
        <div className="flex justify-center mt-8">
          <TurnAdvanceButton
            advancing={advancing}
            navigationMode={disableSSE}
            navigationLabel={disableSSE ? "Go to Next Turn" : undefined}
            onAdvance={handleAdvanceOrNavigate}
          />
        </div>
      )}
      <div className="absolute bottom-8 left-8 w-auto pr-16 z-50">
        <div className="flex justify-center md:justify-start items-center gap-2 md:bg-black/70 px-4 py-2 rounded-lg md:border border-white/20">
          <span className="text-xs text-muted-foreground">
            Show Original Replies
          </span>
          <div className="scale-75 pt-0.5">
            <Switch
              checked={showOriginalReplies}
              onCheckedChange={setShowOriginalReplies}
              id="show-original-replies-switch"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
