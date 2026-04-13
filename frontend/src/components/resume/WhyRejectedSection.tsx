import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { XCircle, ShieldAlert } from 'lucide-react';

interface WhyRejectedSectionProps {
  reasons: string[];
}

export function WhyRejectedSection({ reasons }: WhyRejectedSectionProps) {
  if (!reasons || reasons.length === 0) return null;

  return (
    <Card className="rounded-3xl border-none shadow-sm bg-red-50/50">
      <CardHeader>
        <CardTitle className="text-xl font-bold flex items-center gap-2 text-red-700">
          <ShieldAlert className="h-6 w-6" /> Why you might get rejected
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {reasons.map((reason, idx) => (
          <div key={idx} className="flex gap-3 items-start">
            <div className="mt-1 flex-shrink-0">
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
            <p className="text-sm text-red-800 leading-relaxed font-medium">
              {reason}
            </p>
          </div>
        ))}
        <div className="mt-4 p-4 rounded-2xl bg-white/60 border border-red-100">
          <p className="text-xs text-red-600 font-bold uppercase tracking-wider mb-1">Recruiter Insight</p>
          <p className="text-xs text-red-700 leading-relaxed">
            Indian recruiters spend less than 6 seconds on a resume. These issues might cause an immediate "No" before they even see your skills.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
