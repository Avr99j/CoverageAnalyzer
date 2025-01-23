// src/App.jsx
import React from 'react'
import TestCoverageAnalyzer from './components/TestCoverageAnalyzer'

function App() {
    return (
        <div className="min-h-screen bg-gray-100 p-4">
            <h1 className="text-3xl font-bold mb-4">Test Coverage Analyzer</h1>
            <TestCoverageAnalyzer />
        </div>
    )
}

export default App