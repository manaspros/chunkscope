"use client"

import { Play } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { MetricsPanel } from "./MetricsPanel"
import { useEvaluationStore } from "@/stores/useEvaluationStore"

export function EvalRunner() {
    const {
        metrics,
        evalQuestion,
        evalGroundTruth,
        isEvalLoading,
        error,
        setEvalQuestion,
        setEvalGroundTruth,
        runEvaluation,
    } = useEvaluationStore()

    const handleRun = () => {
        if (evalQuestion.trim()) {
            runEvaluation(evalQuestion.trim(), evalGroundTruth.trim() || undefined)
        }
    }

    return (
        <div className="space-y-6">
            <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider">
                        Run Evaluation
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-zinc-400">
                            Question
                        </label>
                        <Input
                            value={evalQuestion}
                            onChange={(e) => setEvalQuestion(e.target.value)}
                            placeholder="Enter a question to evaluate against your pipeline..."
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-zinc-400">
                            Ground Truth Answer{" "}
                            <span className="text-zinc-600">(optional)</span>
                        </label>
                        <Textarea
                            value={evalGroundTruth}
                            onChange={(e) => setEvalGroundTruth(e.target.value)}
                            placeholder="Provide the expected correct answer for evaluation..."
                            className="min-h-[80px] resize-y"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400">
                            {error}
                        </div>
                    )}

                    <Button
                        onClick={handleRun}
                        disabled={!evalQuestion.trim() || isEvalLoading}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold h-10"
                    >
                        {isEvalLoading ? (
                            <span className="flex items-center gap-2">
                                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                Evaluating...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Play className="w-4 h-4" />
                                Run Evaluation
                            </span>
                        )}
                    </Button>
                </CardContent>
            </Card>

            {/* Results */}
            <MetricsPanel metrics={metrics} isLoading={isEvalLoading} />
        </div>
    )
}
