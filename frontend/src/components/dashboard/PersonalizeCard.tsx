"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, 
  MapPin, 
  Briefcase, 
  Clock, 
  X,
  Plus,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PersonalizationCardProps {
  onApply: (preferences: any) => void;
  isLoading: boolean;
  initialPreferences?: any;
}

export function PersonalizationCard({ onApply, isLoading, initialPreferences }: PersonalizationCardProps) {
  const [role, setRole] = useState(initialPreferences?.targetRole || '');
  const [experience, setExperience] = useState(initialPreferences?.experienceLevel || '1-3 years');
  const [locationInput, setLocationInput] = useState('');
  const [locations, setLocations] = useState<string[]>(initialPreferences?.location || ['Bangalore', 'Remote']);

  const addLocation = () => {
    if (locationInput.trim() && !locations.includes(locationInput.trim())) {
      setLocations([...locations, locationInput.trim()]);
      setLocationInput('');
    }
  };

  const removeLocation = (loc: string) => {
    setLocations(locations.filter(l => l !== loc));
  };

  const handleApply = () => {
    onApply({
      targetRole: role,
      experienceLevel: experience,
      location: locations
    });
  };

  return (
    <Card className="rounded-[32px] border-none shadow-xl bg-white overflow-hidden relative group">
      <div className="absolute top-0 right-0 p-8 opacity-5">
        <Sparkles className="h-24 w-24 text-indigo-600" />
      </div>
      
      <CardContent className="p-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-indigo-600" /> Personalize Results
            </h3>
            <p className="text-sm font-bold text-slate-400">Tailor the AI analysis to your career goals</p>
          </div>
          
          <Button 
            onClick={handleApply}
            disabled={isLoading || !role}
            className="rounded-2xl bg-indigo-600 hover:bg-indigo-700 h-12 px-8 font-black text-white shadow-lg shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Tailoring...
              </>
            ) : (
              'Update Analysis'
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Target Role */}
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Briefcase className="h-3 w-3" /> Target Job Role
            </label>
            <Input 
              placeholder="e.g. Senior Frontend Engineer"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-slate-700 placeholder:text-slate-300 focus-visible:ring-indigo-500 transition-all"
            />
          </div>

          {/* Experience */}
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Clock className="h-3 w-3" /> Experience Level
            </label>
            <select 
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              className="w-full h-14 rounded-2xl bg-slate-50 border-none font-bold text-slate-700 px-4 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer"
            >
              <option>0-1 years (Fresher)</option>
              <option>1-3 years (Junior)</option>
              <option>3-5 years (Mid-level)</option>
              <option>5-8 years (Senior)</option>
              <option>8+ years (Lead/Manager)</option>
            </select>
          </div>

          {/* Multi-Location */}
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <MapPin className="h-3 w-3" /> Preferred Locations
            </label>
            <div className="flex gap-2">
              <Input 
                placeholder="Add city..."
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addLocation()}
                className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-slate-700 placeholder:text-slate-300 focus-visible:ring-indigo-500 transition-all"
              />
              <Button 
                variant="outline" 
                onClick={addLocation}
                className="h-14 w-14 rounded-2xl border-slate-100 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
              >
                <Plus className="h-6 w-6" />
              </Button>
            </div>
            
            <div className="flex flex-wrap gap-2 pt-1">
              <AnimatePresence>
                {locations.map((loc) => (
                  <motion.div
                    key={loc}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                  >
                    <Badge className="bg-indigo-50 text-indigo-700 border-none py-1.5 px-3 rounded-xl flex items-center gap-1 font-bold group/badge">
                      {loc}
                      <button 
                        onClick={() => removeLocation(loc)}
                        className="hover:text-rose-500 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
