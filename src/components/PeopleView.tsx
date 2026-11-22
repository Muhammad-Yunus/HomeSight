import { MapPin, Bell } from 'lucide-react';
import type { ResidentRecord, SecurityEventRecord } from '../types/homesight';

interface PeopleViewProps {
  residents: ResidentRecord[];
  events: SecurityEventRecord[];
}

export function PeopleView({ residents, events }: PeopleViewProps) {
  const unknownDetections = events.filter((e) => e.recognitionStatus === 'not_recognised');

  return (
    <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <section className="lg:col-span-2 bg-[#121417] border border-[#1E2025] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-white">Household Residents</h1>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Real-time presence and push alert acknowledgements synced from ingest API
            </p>
          </div>
          <span className="text-xs text-[#9CA3AF] tabular-nums">
            {residents.filter((r) => r.isHome).length} of {residents.length} home
          </span>
        </div>

        {residents.length === 0 ? (
          <p className="text-sm text-[#6B7280] py-6">
            No residents synced yet. Run the ingest bootstrap endpoint to populate household profiles.
          </p>
        ) : (
          <div className="divide-y divide-[#1E2025]">
            {residents.map((r) => (
              <div key={r.slug} className="py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <img
                    src={r.avatarUrl}
                    alt={r.name}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-full object-cover border border-[#272A32]"
                  />
                  <div>
                    <div className="text-sm font-medium text-white">{r.name}</div>
                    <div className="flex items-center gap-1.5 text-xs text-[#6B7280] mt-0.5">
                      <MapPin className="w-3 h-3" />
                      <span>{r.locationLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <span className={r.isHome ? 'text-[#34D399]' : 'text-[#9CA3AF]'}>
                    {r.isHome ? 'At property' : 'Away'}
                  </span>
                  {r.alertStatus === 'sent' && (
                    <span className="inline-flex items-center gap-1 text-[#9CA3AF]">
                      <Bell className="w-3 h-3" />
                      Sent
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-[#121417] border border-[#1E2025] rounded-2xl p-5">
        <h2 className="text-base font-semibold text-white">Unrecognised Visitors</h2>
        <p className="text-xs text-[#6B7280] mt-0.5 mb-4">
          Recent detections requiring identification
        </p>

        {unknownDetections.length === 0 ? (
          <p className="text-xs text-[#6B7280]">No unrecognised detections recorded.</p>
        ) : (
          <div className="space-y-3">
            {unknownDetections.slice(0, 5).map((evt) => (
              <div
                key={evt.id}
                className="p-3 rounded-xl bg-[#0E1013] border border-[#1E2025] flex items-center gap-3"
              >
                <img
                  src={evt.snapshotUrl}
                  alt={evt.personLabel}
                  referrerPolicy="no-referrer"
                  className="w-14 h-10 rounded-lg object-cover"
                />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-white truncate">{evt.personLabel}</div>
                  <div className="text-[11px] text-[#F25C19] tabular-nums">
                    {evt.matchConfidence}% match · {new Date(evt.enteredAt).toISOString().slice(11, 16)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
