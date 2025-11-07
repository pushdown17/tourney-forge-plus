import { Navigation } from "@/components/Navigation";
import { BracketNode } from "@/components/BracketNode";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const BracketDemo = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      
      <main className="container mx-auto px-4 pt-32 pb-16">
        <div className="mb-8">
          <Link to="/">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
          <h1 className="text-4xl md:text-5xl font-bold mb-2 glow-text-primary">
            Tournament Bracket
          </h1>
          <p className="text-muted-foreground">
            Summer Championship 2024 - Single Elimination
          </p>
        </div>

        {/* Bracket Visualization */}
        <div className="overflow-x-auto pb-8">
          <div className="inline-flex gap-16 min-w-max">
            {/* Quarter Finals */}
            <div className="flex flex-col gap-8 justify-around">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-4 text-center">
                  QUARTER FINALS
                </h3>
                <div className="space-y-8">
                  <BracketNode 
                    player1="Team Alpha" 
                    player2="Team Beta"
                    score1={2}
                    score2={1}
                    winner={1}
                  />
                  <BracketNode 
                    player1="Team Gamma" 
                    player2="Team Delta"
                    score1={0}
                    score2={2}
                    winner={2}
                  />
                  <BracketNode 
                    player1="Team Epsilon" 
                    player2="Team Zeta"
                    score1={2}
                    score2={0}
                    winner={1}
                  />
                  <BracketNode 
                    player1="Team Eta" 
                    player2="Team Theta"
                    score1={1}
                    score2={2}
                    winner={2}
                  />
                </div>
              </div>
            </div>

            {/* Semi Finals */}
            <div className="flex flex-col justify-center">
              <h3 className="text-sm font-semibold text-muted-foreground mb-4 text-center">
                SEMI FINALS
              </h3>
              <div className="space-y-32">
                <BracketNode 
                  player1="Team Alpha" 
                  player2="Team Delta"
                  score1={2}
                  score2={1}
                  winner={1}
                />
                <BracketNode 
                  player1="Team Epsilon" 
                  player2="Team Theta"
                  score1={1}
                  score2={2}
                  winner={2}
                />
              </div>
            </div>

            {/* Finals */}
            <div className="flex flex-col justify-center">
              <h3 className="text-sm font-semibold text-muted-foreground mb-4 text-center">
                FINALS
              </h3>
              <BracketNode 
                player1="Team Alpha" 
                player2="Team Theta"
                score1={3}
                score2={1}
                winner={1}
              />
            </div>

            {/* Winner */}
            <div className="flex flex-col justify-center items-center">
              <h3 className="text-sm font-semibold text-muted-foreground mb-4 text-center">
                CHAMPION
              </h3>
              <div className="glass-card p-8 rounded-lg text-center">
                <div className="text-6xl mb-4">🏆</div>
                <div className="text-2xl font-bold text-primary glow-text-primary">
                  Team Alpha
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  Tournament Winner
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default BracketDemo;
