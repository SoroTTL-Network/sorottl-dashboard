import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ className = "", children, ...props }: CardProps) {
  return (
    <div
      className={`bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
