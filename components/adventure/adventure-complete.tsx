import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, Trophy, BookOpen } from "lucide-react"
import Link from "next/link"

export default function AdventureComplete() {
  return (
    <Card className="max-w-2xl mx-auto border-2 border-green-200 bg-gradient-to-b from-green-50 to-white">
      <CardContent className="flex flex-col items-center gap-6 py-16">
        <div className="flex items-center gap-3">
          <Trophy className="h-12 w-12 text-yellow-500 animate-bounce" />
          <CheckCircle className="h-12 w-12 text-green-500" />
        </div>

        <div className="text-center space-y-3">
          <h2 className="text-3xl font-bold text-green-800">Adventure Complete!</h2>
          <p className="text-xl text-muted-foreground">Congratulations! You have successfully completed this adventure.</p>
          <p className="text-sm text-muted-foreground max-w-md">
            The story has reached its conclusion. Your journey through the Valkarr forest and the mysteries it holds has come to an end. Well done, adventurer!
          </p>
        </div>

        <div className="flex gap-3 mt-4">
          <Button asChild variant="outline" className="flex items-center gap-2">
            <Link href="/">
              <BookOpen className="h-4 w-4" />
              Explore More Adventures
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
