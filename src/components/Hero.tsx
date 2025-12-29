import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Trophy, Users, Zap } from "lucide-react";
import heroBackground from "@/assets/hero-background.jpg";
import { SearchBar } from "@/components/SearchBar";
import { TournamentsList } from "@/components/TournamentsList";

export const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0 opacity-20"
        style={{
          backgroundImage: `url(${heroBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-background via-background/80 to-background" />
      
      {/* Content */}
      <div className="container mx-auto px-4 z-10 text-center">
        <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold mb-6 glow-text-primary">
          Organize Epic
          <br />
          <span className="text-accent glow-text-accent">Bike Polo Tournaments</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto">
          Create, manage, and track bike polo tournaments with ease. 
          The modern platform for bike polo organizers and communities.
        </p>
        
        <div className="mb-8">
          <SearchBar />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <Link to="/create-tournament">
            <Button size="lg" variant="hero" className="text-lg px-8 py-6">
              Create Tournament
            </Button>
          </Link>
        </div>
        
        {/* Tournaments List */}
        <div className="mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-8 text-center glow-text-primary">
            Tournois récents
          </h2>
          <TournamentsList />
        </div>
        
        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="glass-card p-6 rounded-lg hover:scale-105 transition-transform duration-300">
            <Trophy className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Multiple Formats</h3>
            <p className="text-muted-foreground">Single/double elimination, round-robin, and more</p>
          </div>
          
          <div className="glass-card p-6 rounded-lg hover:scale-105 transition-transform duration-300">
            <Users className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Easy Management</h3>
            <p className="text-muted-foreground">Intuitive interface for participants and organizers</p>
          </div>
          
          <div className="glass-card p-6 rounded-lg hover:scale-105 transition-transform duration-300">
            <Zap className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Real-time Updates</h3>
            <p className="text-muted-foreground">Live bracket updates and instant notifications</p>
          </div>
        </div>
      </div>
    </section>
  );
};
