import React from "react";
import "@/globals.css";

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto p-4">{children}</div>
      </body>
    </html>
  );
};

export default Layout;