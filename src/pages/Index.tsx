import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { TournamentsList } from "@/components/TournamentsList";
import { SearchBar } from "@/components/SearchBar";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      <Hero />
      
      <section className="container mx-auto px-4 py-8">
        <SearchBar />
      </section>
      
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl md:text-4xl font-bold mb-8 text-center glow-text-primary">
          Tournois récents
        </h2>
        <TournamentsList />
      </section>
    </div>
  );
};

export default Index;
