import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Trophy, LogOut, Menu, X, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export const Navigation = () => {
  const [user, setUser] = useState<any>(null);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    setIsOpen(false);
    navigate("/");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg md:text-xl">
          <Trophy className="h-5 w-5 md:h-6 md:w-6 text-primary" />
          <span className="glow-text-primary hidden sm:inline">Bike Polo Tournament</span>
          <span className="glow-text-primary sm:hidden">BP Tournament</span>
        </Link>
        
        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost">Home</Button>
          </Link>
          {user ? (
            <>
              <Link to="/create-tournament">
                <Button variant="hero">Create Tournament</Button>
              </Link>
              <Link to="/my-account">
                <Button variant="ghost">
                  <User className="h-4 w-4 mr-2" />
                  My Account
                </Button>
              </Link>
              <Button variant="ghost" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </>
          ) : (
            <Link to="/auth">
              <Button variant="hero">Login</Button>
            </Link>
          )}
        </div>

        {/* Mobile Menu */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64">
            <div className="flex flex-col gap-4 mt-8">
              <Link to="/" onClick={() => setIsOpen(false)}>
                <Button variant="ghost" className="w-full justify-start text-lg">
                  Home
                </Button>
              </Link>
              {user ? (
                <>
                  <Link to="/create-tournament" onClick={() => setIsOpen(false)}>
                    <Button variant="hero" className="w-full justify-start text-lg">
                      Create Tournament
                    </Button>
                  </Link>
                  <Link to="/my-account" onClick={() => setIsOpen(false)}>
                    <Button variant="ghost" className="w-full justify-start text-lg">
                      <User className="h-5 w-5 mr-2" />
                      My Account
                    </Button>
                  </Link>
                  <Button 
                    variant="ghost" 
                    onClick={handleLogout}
                    className="w-full justify-start text-lg"
                  >
                    <LogOut className="h-5 w-5 mr-2" />
                    Logout
                  </Button>
                </>
              ) : (
                <Link to="/auth" onClick={() => setIsOpen(false)}>
                  <Button variant="hero" className="w-full justify-start text-lg">
                    Login
                  </Button>
                </Link>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
};
