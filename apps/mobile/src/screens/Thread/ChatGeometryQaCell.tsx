import React, { useLayoutEffect } from 'react';

/** No native wrapper or measurement. Enabled only in the explicitly opted-in QA build. */
export function ChatGeometryQaCell({ index, observe, children }: Readonly<{
  index: number; observe: (index: number, present: boolean) => void; children: React.ReactNode;
}>) {
  useLayoutEffect(() => { observe(index, true); return () => observe(index, false); }, [index, observe]);
  return <>{children}</>;
}
