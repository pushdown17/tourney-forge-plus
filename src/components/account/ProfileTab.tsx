import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Save, Search, X, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { PlayerSearchDialog } from "./PlayerSearchDialog";

type Profile = {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  linked_player_id: string | null;
};

export function ProfileTab({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [linkedPlayerName, setLinkedPlayerName] = useState<string | null>(null);
  const [showPlayerSearch, setShowPlayerSearch] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  const fetchProfile = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching profile:", error);
    }

    if (data) {
      setProfile(data as Profile);
      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      setNickname(data.nickname || "");
      setAvatarUrl(data.avatar_url);

      if (data.linked_player_id) {
        const { data: player } = await supabase
          .from("players")
          .select("name")
          .eq("id", data.linked_player_id)
          .single();
        setLinkedPlayerName(player?.name || null);
      }
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const profileData = {
      user_id: userId,
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      nickname: nickname.trim() || null,
      avatar_url: avatarUrl,
      linked_player_id: profile?.linked_player_id || null,
    };

    let error;
    if (profile) {
      ({ error } = await supabase
        .from("profiles")
        .update(profileData)
        .eq("user_id", userId));
    } else {
      ({ error } = await supabase.from("profiles").insert(profileData));
    }

    if (error) {
      toast.error("Error saving profile");
      console.error(error);
    } else {
      toast.success("Profile saved!");
      await fetchProfile();
    }
    setSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must not exceed 2 MB");
      return;
    }

    setUploading(true);
    const fileExt = file.name.split(".").pop();
    const filePath = `${userId}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast.error("Error uploading image");
      console.error(uploadError);
    } else {
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);
      setAvatarUrl(publicUrl + "?t=" + Date.now());
      toast.success("Photo updated!");
    }
    setUploading(false);
  };

  const handleLinkPlayer = async (playerId: string, playerName: string) => {
    const profileData = {
      user_id: userId,
      linked_player_id: playerId,
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      nickname: nickname.trim() || null,
      avatar_url: avatarUrl,
    };

    let error;
    if (profile) {
      ({ error } = await supabase
        .from("profiles")
        .update({ linked_player_id: playerId })
        .eq("user_id", userId));
    } else {
      ({ error } = await supabase.from("profiles").insert(profileData));
    }

    if (error) {
      if (error.code === "23505") {
        toast.error("This player is already linked to another account");
      } else {
        toast.error("Error linking player");
      }
      console.error(error);
    } else {
      setLinkedPlayerName(playerName);
      toast.success(`Account linked to player "${playerName}"`);
      await fetchProfile();
    }
    setShowPlayerSearch(false);
  };

  const handleUnlinkPlayer = async () => {
    if (!profile) return;
    const { error } = await supabase
      .from("profiles")
      .update({ linked_player_id: null })
      .eq("user_id", userId);

    if (error) {
      toast.error("Error unlinking player");
    } else {
      setLinkedPlayerName(null);
      toast.success("Player unlinked");
      await fetchProfile();
    }
  };

  if (loading) {
    return <Card className="p-6 glass-card animate-pulse h-64" />;
  }

  const initials = [firstName, lastName]
    .filter(Boolean)
    .map((n) => n[0]?.toUpperCase())
    .join("") || userEmail[0]?.toUpperCase() || "?";

  return (
    <div className="space-y-6">
      <Card className="p-6 glass-card">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          {/* Avatar */}
          <div className="relative group">
            <Avatar className="h-24 w-24">
              <AvatarImage src={avatarUrl || undefined} />
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <Camera className="h-6 w-6 text-white" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>

          {/* Form */}
          <div className="flex-1 w-full space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Your first name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Your last name"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nickname">Nickname</Label>
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Your nickname"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={userEmail} disabled className="opacity-60" />
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Player linking */}
      <Card className="p-6 glass-card">
        <h3 className="text-lg font-semibold mb-4">Player Link</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Link your account to an existing player profile to see your tournament stats.
        </p>

        {profile?.linked_player_id && linkedPlayerName ? (
          <div className="flex items-center gap-3">
            <Link2 className="h-5 w-5 text-primary" />
            <span className="font-medium">{linkedPlayerName}</span>
            <Button variant="ghost" size="sm" onClick={handleUnlinkPlayer} className="gap-1 text-destructive">
              <Unlink className="h-4 w-4" />
              Unlink
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setShowPlayerSearch(true)} className="gap-2">
            <Search className="h-4 w-4" />
            Search for a player
          </Button>
        )}
      </Card>

      <PlayerSearchDialog
        open={showPlayerSearch}
        onOpenChange={setShowPlayerSearch}
        onSelect={handleLinkPlayer}
      />
    </div>
  );
}
