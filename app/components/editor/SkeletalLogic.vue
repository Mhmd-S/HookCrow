<script setup lang="ts">
import type { Segment, SkeletalLogicAnalysis } from '~/types'

interface Props {
    analysis: SkeletalLogicAnalysis | null
    segments: Segment[]
    generating?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    analysis: null,
    generating: false
})

const emit = defineEmits<{
    generate: []
}>()

const hasTranscripts = computed(() => props.segments.some((s) => (s.transcript_raw || '').trim().length > 0))

const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`
}

const getSegmentTimeRange = (index: number): string | null => {
    const seg = props.segments[index]
    if (!seg) return null
    return `${formatTime(seg.start_time)} - ${formatTime(seg.end_time)}`
}

const getSegmentBadgeClass = (label: string): string => {
    const classes: Record<string, string> = {
        Hook: 'bg-red-500/10 text-red-500 ring-1 ring-inset ring-red-500/30',
        Bridge: 'bg-yellow-500/10 text-yellow-600 ring-1 ring-inset ring-yellow-500/30',
        Value: 'bg-green-500/10 text-green-600 ring-1 ring-inset ring-green-500/30',
        Proof: 'bg-blue-500/10 text-blue-600 ring-1 ring-inset ring-blue-500/30',
        CTA: 'bg-purple-500/10 text-purple-600 ring-1 ring-inset ring-purple-500/30'
    }
    return classes[label] || 'bg-muted text-muted ring-1 ring-inset ring-muted'
}
</script>

<template>
    <div class="h-full flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between p-3 border-b border-muted">
            <div class="flex items-center gap-2">
                <UIcon name="i-ph-brain" class="w-4 h-4 text-muted" />
                <span class="text-sm font-medium text-default">Skeletal Logic (Analysis)</span>
            </div>

            <UButton
                size="sm"
                color="primary"
                variant="soft"
                icon="i-ph-sparkle"
                :loading="generating"
                :disabled="!hasTranscripts"
                @click="emit('generate')"
            >
                {{ analysis ? 'Regenerate' : 'Generate' }}
            </UButton>
        </div>

        <div v-if="!hasTranscripts" class="flex-1 flex items-center justify-center p-6">
            <div class="text-center max-w-md">
                <UIcon name="i-ph-microphone-slash" class="w-10 h-10 mx-auto text-muted mb-3" />
                <p class="text-sm text-default font-medium">No transcript available yet</p>
                <p class="text-xs text-dimmed mt-1">
                    Transcribe the video (or fill segment transcripts) first, then generate the per-segment strategic analysis.
                </p>
            </div>
        </div>

        <div v-else-if="!analysis" class="flex-1 flex items-center justify-center p-6">
            <div class="text-center max-w-md">
                <UIcon name="i-ph-brain" class="w-10 h-10 mx-auto text-muted mb-3" />
                <p class="text-sm text-default font-medium">No analysis generated yet</p>
                <p class="text-xs text-dimmed mt-1">
                    Click “Generate” to create an in-depth breakdown for each segment.
                </p>
            </div>
        </div>

        <div v-else class="flex-1 overflow-y-auto p-4 space-y-4">
            <!-- Per-segment analysis -->
            <div class="space-y-3">
                <div
                    v-for="(seg, index) in analysis.segments"
                    :key="`${seg.label}-${index}`"
                    class="rounded-lg border border-muted p-3"
                >
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <UBadge
                                variant="subtle"
                                size="xs"
                                :class="getSegmentBadgeClass(seg.label)"
                            >
                                {{ seg.label || 'Segment' }}
                            </UBadge>
                            <span v-if="getSegmentTimeRange(index)" class="text-xs text-dimmed">
                                {{ getSegmentTimeRange(index) }}
                            </span>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <div>
                            <div class="text-xs font-medium text-muted">Goal</div>
                            <div class="text-sm text-default whitespace-pre-wrap">{{ seg.goal }}</div>
                        </div>
                        <div>
                            <div class="text-xs font-medium text-muted">Transcript</div>
                            <div class="text-sm text-default whitespace-pre-wrap">
                                {{ (segments[index]?.transcript_raw || '').trim() }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

