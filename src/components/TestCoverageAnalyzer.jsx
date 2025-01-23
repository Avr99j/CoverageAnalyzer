import React, { useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Upload, AlertCircle, CheckCircle, FileText } from 'lucide-react';
import Papa from 'papaparse';

const TestCoverageAnalyzer = () => {
    const [files, setFiles] = useState({
        criteria: null,
        testCases: null
    });
    const [fileContents, setFileContents] = useState({
        criteria: '',
        testCases: ''
    });
    const [analysis, setAnalysis] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [error, setError] = useState('');

    const handleDrag = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const files = e.dataTransfer.files;
        if (files.length > 2) {
            setError('Please drop only two files: one for criteria and one for test cases');
            return;
        }

        handleFiles(files);
    }, []);

    const handleFiles = async (fileList) => {
        const processedFiles = {};
        const processedContents = {};

        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            const fileType = file.name.toLowerCase().includes('test') ? 'testCases' : 'criteria';

            try {
                const content = await readFile(file);
                processedFiles[fileType] = file;
                processedContents[fileType] = content;
            } catch (err) {
                setError(`Error reading ${file.name}: ${err.message}`);
                return;
            }
        }

        setFiles(prev => ({ ...prev, ...processedFiles }));
        setFileContents(prev => ({ ...prev, ...processedContents }));
    };

    const readFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                const content = e.target.result;

                if (file.name.endsWith('.csv')) {
                    Papa.parse(content, {
                        complete: (results) => {
                            const formattedContent = results.data
                                .filter(row => row.length > 0 && row[0])
                                .map(row => row.join(': '))
                                .join('\n');
                            resolve(formattedContent);
                        },
                        error: (error) => reject(error)
                    });
                } else if (file.name.endsWith('.json')) {
                    try {
                        const jsonData = JSON.parse(content);
                        const formattedContent = Array.isArray(jsonData)
                            ? jsonData.map(item => item.description || item.text || item).join('\n')
                            : jsonData.items?.map(item => item.description || item.text || item).join('\n') || '';
                        resolve(formattedContent);
                    } catch (err) {
                        reject(new Error('Invalid JSON format'));
                    }
                } else {
                    resolve(content);
                }
            };

            reader.onerror = () => reject(new Error('File read error'));
            reader.readAsText(file);
        });
    };

    const handleFileUpload = async (event, fileType) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const content = await readFile(file);
            setFiles(prev => ({ ...prev, [fileType]: file }));
            setFileContents(prev => ({ ...prev, [fileType]: content }));
            setError('');
        } catch (err) {
            setError(`Error reading ${fileType} file: ${err.message}`);
        }
    };

    const analyzeTestCoverage = () => {
        if (!fileContents.criteria || !fileContents.testCases) {
            setError('Please upload both acceptance criteria and test cases files');
            return;
        }

        // Parse acceptance criteria
        const criteria = fileContents.criteria
            .split('\n')
            .filter(line => line.trim())
            .map((criterion, index) => ({
                id: `AC${index + 1}`,
                text: criterion.trim(),
            }));

        // Parse test cases
        const tests = fileContents.testCases
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const match = line.match(/^(TC\d+|Test\s*\d+|[^:]+):\s*(.+)$/);
                return match ? {
                    id: match[1].replace(/\s+/g, ''),
                    text: match[2].trim(),
                    linkedCriteria: []
                } : null;
            })
            .filter(Boolean);

        // Analysis logic
        const getWordSet = (text) => new Set(text.toLowerCase().split(/\W+/).filter(w => w.length > 3));
        const matrix = [];
        const coverageMap = new Map();

        criteria.forEach(criterion => {
            const criterionWords = getWordSet(criterion.text);
            const row = { criterion: criterion.id, coverage: [] };
            let isCovered = false;

            tests.forEach(test => {
                const testWords = getWordSet(test.text);
                const commonWords = [...criterionWords].filter(word => testWords.has(word));
                const coverage = commonWords.length / criterionWords.size;

                if (coverage > 0.3) {
                    test.linkedCriteria.push(criterion.id);
                    row.coverage.push(test.id);
                    isCovered = true;
                }
            });

            matrix.push(row);
            coverageMap.set(criterion.id, isCovered);
        });

        // Calculate metrics
        const totalCriteria = criteria.length;
        const coveredCriteria = [...coverageMap.values()].filter(Boolean).length;
        const coveragePercentage = (coveredCriteria / totalCriteria * 100).toFixed(1);
        const uncoveredCriteria = criteria.filter(c => !coverageMap.get(c.id));

        setAnalysis({
            matrix,
            metrics: {
                totalCriteria,
                coveredCriteria,
                coveragePercentage,
                totalTestCases: tests.length
            },
            gaps: uncoveredCriteria,
            testCases: tests
        });
    };

    const exportAnalysis = () => {
        if (!analysis) return;

        const exportData = {
            metrics: analysis.metrics,
            traceabilityMatrix: analysis.matrix,
            coverageGaps: analysis.gaps,
            testCases: analysis.testCases
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'test-coverage-analysis.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="w-full max-w-4xl mx-auto space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="w-6 h-6" />
                        Upload Test Files
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                            }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block mb-2 font-medium">
                                    Acceptance Criteria File
                                    <span className="text-sm text-gray-500 ml-2">(txt, csv, json)</span>
                                </label>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="file"
                                        accept=".txt,.csv,.json"
                                        onChange={(e) => handleFileUpload(e, 'criteria')}
                                        className="hidden"
                                        id="criteria-file"
                                    />
                                    <label
                                        htmlFor="criteria-file"
                                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer flex items-center"
                                    >
                                        <Upload className="mr-2 w-4 h-4" />
                                        Upload Criteria
                                    </label>
                                    {files.criteria && (
                                        <span className="text-sm text-gray-600">{files.criteria.name}</span>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block mb-2 font-medium">
                                    Test Cases File
                                    <span className="text-sm text-gray-500 ml-2">(txt, csv, json)</span>
                                </label>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="file"
                                        accept=".txt,.csv,.json"
                                        onChange={(e) => handleFileUpload(e, 'testCases')}
                                        className="hidden"
                                        id="testcases-file"
                                    />
                                    <label
                                        htmlFor="testcases-file"
                                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer flex items-center"
                                    >
                                        <Upload className="mr-2 w-4 h-4" />
                                        Upload Test Cases
                                    </label>
                                    {files.testCases && (
                                        <span className="text-sm text-gray-600">{files.testCases.name}</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="mt-4 p-2 bg-red-50 border border-red-200 rounded text-red-600 flex items-center">
                                <AlertCircle className="w-4 h-4 mr-2" />
                                {error}
                            </div>
                        )}

                        <div className="mt-6 text-gray-500">
                            <p>Drag and drop your files here or use the upload buttons</p>
                            <p className="text-sm mt-2">Supported formats: TXT, CSV, JSON</p>
                        </div>
                    </div>

                    <div className="mt-4 flex space-x-2">
                        <button
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
                            onClick={analyzeTestCoverage}
                        >
                            Analyze Coverage
                        </button>
                        {analysis && (
                            <button
                                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center"
                                onClick={exportAnalysis}
                            >
                                Export Analysis
                            </button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {analysis && (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle>Coverage Metrics</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-blue-50 rounded-lg">
                                    <div className="text-lg font-medium text-blue-900">
                                        Coverage: {analysis.metrics.coveragePercentage}%
                                    </div>
                                    <div className="mt-2 text-blue-700">
                                        {analysis.metrics.coveredCriteria} of {analysis.metrics.totalCriteria} criteria covered
                                    </div>
                                </div>
                                <div className="p-4 bg-green-50 rounded-lg">
                                    <div className="text-lg font-medium text-green-900">
                                        Test Cases: {analysis.metrics.totalTestCases}
                                    </div>
                                    <div className="mt-2 text-green-700">
                                        Average {(analysis.metrics.totalTestCases / analysis.metrics.totalCriteria).toFixed(1)} tests per criterion
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Traceability Matrix</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 text-left">Criterion</th>
                                            <th className="px-4 py-2 text-left">Linked Test Cases</th>
                                            <th className="px-4 py-2 text-left">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analysis.matrix.map((row, index) => (
                                            <tr key={index} className="border-t">
                                                <td className="px-4 py-2">{row.criterion}</td>
                                                <td className="px-4 py-2">
                                                    {row.coverage.length > 0 ? row.coverage.join(', ') : '-'}
                                                </td>
                                                <td className="px-4 py-2">
                                                    {row.coverage.length > 0 ? (
                                                        <CheckCircle className="text-green-500 w-5 h-5" />
                                                    ) : (
                                                        <AlertCircle className="text-red-500 w-5 h-5" />
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>


                    {analysis.gaps.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Coverage Gaps</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {analysis.gaps.map((criterion, index) => (
                                        <div key={index} className="p-3 bg-red-50 border border-red-200 rounded">
                                            <span className="font-medium">{criterion.id}:</span> {criterion.text}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>

            )}
        </div>
    );
};

export default TestCoverageAnalyzer;