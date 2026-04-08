import { Skeleton } from '@/components/ui/skeleton';

export default function SocietyManageGenericLoading() {
  return (
    <div className="space-y-6">
      {/* Header section skeleton */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div className="space-y-2">
           <Skeleton className="h-7 w-40" />
           <Skeleton className="h-4 w-60" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* Grid of items (cards or stats) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-4">
             <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
             </div>
             <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>

      {/* List content skeleton */}
      <div className="space-y-3">
         {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row gap-4 sm:items-center">
               <Skeleton className="w-full sm:w-32 h-20 rounded-lg shrink-0" />
               <div className="flex-1 space-y-2">
                 <Skeleton className="h-5 w-3/4" />
                 <Skeleton className="h-4 w-1/2" />
                 <div className="flex gap-2 pt-2">
                   <Skeleton className="h-6 w-16 rounded-full" />
                   <Skeleton className="h-6 w-20 rounded-full" />
                 </div>
               </div>
               <div className="hidden sm:block">
                 <Skeleton className="h-9 w-9 rounded-lg" />
               </div>
            </div>
         ))}
      </div>
    </div>
  );
}
