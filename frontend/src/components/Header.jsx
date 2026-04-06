import React from 'react';

const Header = () => {
  return (
    <header className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-100">
              ✨ Slidea
            </h1>
            <p className="text-gray-100 mt-2">AI-Powered Presentation Generator</p>
          </div>
          <div className="text-right text-gray-100">
            <p className="text-sm">Create stunning presentations in seconds</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
