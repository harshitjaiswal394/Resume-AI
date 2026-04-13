"use client";

import React, { useState, useRef, useEffect } from 'react';
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

const ALL_ROLES = [
  "Software Engineer", "Frontend Developer", "Backend Developer", "Full Stack Developer", "Mobile App Developer",
  "DevOps Engineer", "Data Scientist", "Machine Learning Engineer", "Cybersecurity Engineer", "Blockchain Developer",
  "Cloud Architect", "Data Engineer", "QA Engineer", "Product Manager", "UI/UX Designer", "Site Reliability Engineer",
  "System Administrator", "Data Analyst", "Android Developer", "iOS Developer", "React Developer", "Python Developer",
  "Solution Architect", "Technical Architect", "Platform Engineer", "Security Researcher", "Data Warehouse Engineer"
];

// Indian Tech Hubs Only as requested
const ALL_LOCATIONS = [
  "Bangalore", "Hyderabad", "Pune", "Delhi NCR", "Mumbai", "Chennai", "Kolkata", "Gurgaon", "Noida", "Ahmedabad", "Remote"
];

const EXPERIENCE_LEVELS = ["Entry level", "Mid-Senior", "Director", "Executive"];
const WORK_MODES = ["Remote", "On-site", "Hybrid"];

export function PersonalizationCard({ onApply, isLoading, initialPreferences }: PersonalizationCardProps) {
  const [role, setRole] = useState(initialPreferences?.targetRole || '');
  const [showRoleSuggestions, setShowRoleSuggestions] = useState(false);

  const [experience, setExperience] = useState<string[]>(
    Array.isArray(initialPreferences?.experienceLevel)
      ? initialPreferences.experienceLevel
      : [initialPreferences?.experienceLevel || "Entry level"]
  );

  // Requirement: Default no location selected
  const [locations, setLocations] = useState<string[]>(initialPreferences?.location || []);
  const [locationInput, setLocationInput] = useState('');
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  const [workModes, setWorkModes] = useState<string[]>(
    Array.isArray(initialPreferences?.workMode)
      ? initialPreferences.workMode
      : [initialPreferences?.workMode || "Remote"]
  );

  const [daysOld, setDaysOld] = useState(initialPreferences?.daysOld || 25);

  const roleRef = useRef<HTMLDivElement>(null);
  const locationRef = useRef<HTMLDivElement>(null);

  // Click outside logic
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (roleRef.current && !roleRef.current.contains(event.target as Node)) {
        setShowRoleSuggestions(false);
      }
      if (locationRef.current && !locationRef.current.contains(event.target as Node)) {
        setShowLocationSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredRoles = ALL_ROLES.filter(r =>
    r.toLowerCase().includes(role.toLowerCase()) && r !== role
  ).slice(0, 5);

  const filteredLocations = ALL_LOCATIONS.filter(l =>
    l.toLowerCase().includes(locationInput.toLowerCase()) && !locations.includes(l)
  ).slice(0, 5);

  const toggleItem = (list: string[], setList: (l: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  const addLocation = (loc: string) => {
    const cleaned = loc.trim();
    if (cleaned && !locations.includes(cleaned)) {
      setLocations([...locations, cleaned]);
      setLocationInput('');
      setShowLocationSuggestions(false);
    }
  };

  const isFormValid = role.trim().length > 0 && experience.length > 0 && workModes.length > 0 && locations.length > 0;

  const handleApply = () => {
    onApply({
      targetRole: role,
      experienceLevel: experience,
      location: locations,
      workMode: workModes,
      daysOld: daysOld
    });
  };

  return (
    <Card className="rounded-[32px] border-none shadow-2xl bg-white overflow-visible relative group">
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
            disabled={isLoading || !isFormValid}
            className={`
              rounded-2xl h-14 px-10 font-bold text-base shadow-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed
              ${isFormValid
                ? 'bg-indigo-700 hover:bg-indigo-800 text-white shadow-indigo-200 animate-pulse'
                : 'bg-slate-200 text-slate-500 shadow-none'}
            `}
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {/* Target Role with Autosuggest */}
          <div className="space-y-3 relative" ref={roleRef}>
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Briefcase className="h-3 w-3" /> Target Role
            </label>
            <div className="relative">
              <Input
                placeholder="search roles..."
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setShowRoleSuggestions(true);
                }}
                onFocus={() => setShowRoleSuggestions(true)}
                className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-slate-700 placeholder:text-slate-300 focus-visible:ring-2 focus-visible:ring-indigo-500 transition-all shadow-inner"
              />
              <AnimatePresence>
                {showRoleSuggestions && filteredRoles.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute z-50 w-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
                  >
                    {filteredRoles.map((r) => (
                      <div
                        key={r}
                        onClick={() => {
                          setRole(r);
                          setShowRoleSuggestions(false);
                        }}
                        className="p-4 hover:bg-indigo-50 cursor-pointer font-bold text-sm text-slate-600 transition-colors border-b border-slate-50 last:border-0"
                      >
                        {r}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Multi-Select Experience */}
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Clock className="h-3 w-3" /> Experience
            </label>
            <div className="flex flex-wrap gap-2 p-2 bg-slate-50 rounded-2xl min-h-[56px] shadow-inner">
              {EXPERIENCE_LEVELS.map(level => {
                const isSelected = experience.includes(level);
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleItem(experience, setExperience, level)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${isSelected
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                        : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-100'
                      }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Multi-Select Mode */}
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="h-3 w-3" /> Mode
            </label>
            <div className="flex flex-wrap gap-2 p-2 bg-slate-50 rounded-2xl min-h-[56px] shadow-inner">
              {WORK_MODES.map(mode => {
                const isSelected = workModes.includes(mode);
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => toggleItem(workModes, setWorkModes, mode)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${isSelected
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                        : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-100'
                      }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Days Old */}
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Clock className="h-3 w-3" /> Max Age (Days)
            </label>
            <Input
              type="number"
              value={daysOld}
              min={1}
              onChange={(e) => setDaysOld(parseInt(e.target.value) || 1)}
              className="h-14 rounded-2xl bg-slate-50 border-none font-black text-indigo-600 focus-visible:ring-indigo-500 transition-all text-center shadow-inner text-lg"
            />
          </div>

          {/* Locations with Autosuggest & Tags */}
          <div className="space-y-3 relative" ref={locationRef}>
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <MapPin className="h-3 w-3" /> Locations
            </label>
            <div className="relative group">
              <Input
                placeholder="search cities..."
                value={locationInput}
                onChange={(e) => {
                  setLocationInput(e.target.value);
                  setShowLocationSuggestions(true);
                }}
                onFocus={() => setShowLocationSuggestions(true)}
                onKeyDown={(e) => e.key === 'Enter' && addLocation(locationInput)}
                className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-slate-700 placeholder:text-slate-300 focus-visible:ring-2 focus-visible:ring-indigo-500 transition-all pr-12 shadow-inner"
              />
              <button
                type="button"
                onClick={() => addLocation(locationInput)}
                className="absolute right-3 top-3 h-8 w-8 rounded-xl bg-white flex items-center justify-center shadow-sm hover:bg-slate-50 border border-slate-100"
              >
                <Plus className="h-4 w-4 text-indigo-600" />
              </button>

              <AnimatePresence>
                {showLocationSuggestions && filteredLocations.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute z-50 w-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
                  >
                    {filteredLocations.map((l) => (
                      <div
                        key={l}
                        onClick={() => addLocation(l)}
                        className="p-4 hover:bg-indigo-50 cursor-pointer font-bold text-sm text-slate-600 transition-colors border-b border-slate-50 last:border-0"
                      >
                        {l}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-wrap gap-2 min-h-[30px]">
              <AnimatePresence>
                {locations.map((loc) => (
                  <motion.div
                    key={loc}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                  >
                    <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-100 py-1.5 px-3 rounded-xl flex items-center gap-1.5 font-black text-[10px] shadow-sm">
                      {loc} <X className="h-3 w-3 cursor-pointer hover:text-rose-500 transition-colors" onClick={() => setLocations(locations.filter(l => l !== loc))} />
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
