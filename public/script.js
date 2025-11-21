document.addEventListener('DOMContentLoaded', function() {
    const rawTranscript = document.getElementById('rawTranscript');
    const processBtn = document.getElementById('processBtn');
    const clearBtn = document.getElementById('clearBtn');
    const outputArea = document.getElementById('outputArea');
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const verifySpeakersBtn = document.getElementById('verifySpeakersBtn');
    const segmentBtn = document.getElementById('segmentBtn');
    const addDisclaimersBtn = document.getElementById('addDisclaimersBtn');
    const errorMsg = document.getElementById('errorMsg');
    const stats = document.getElementById('stats');
    const tokensUsed = document.getElementById('tokensUsed');
    const changeLog = document.getElementById('changeLog');
    const changeLogContent = document.getElementById('changeLogContent');

    let cleanedTranscriptText = '';
    let totalTokensUsed = 0;
    let hasDisclaimers = false;

    function addChangeLogEntry(title, changes) {
        const entry = document.createElement('div');
        entry.className = 'change-log-entry';
        
        const timestamp = new Date().toLocaleTimeString();
        let html = `<h4>${title} (${timestamp})</h4>`;
        
        if (typeof changes === 'string') {
            // Check if it's a multi-line detailed format (like verify-speakers changes)
            if (changes.includes('\n') && (changes.includes('Chunk') || changes.includes('•') || changes.includes('Found and fixed'))) {
                // Format as structured list with proper line breaks
                const lines = changes.split('\n');
                html += '<div class="detailed-changes">';
                lines.forEach(line => {
                    line = line.trim();
                    if (!line) return;
                    
                    if (line.startsWith('Found and fixed') || line.startsWith('✓')) {
                        html += `<p class="changes-header"><strong>${line}</strong></p>`;
                    } else if (line.startsWith('Chunk')) {
                        html += `<p class="chunk-header"><strong>${line}</strong></p>`;
                    } else if (line.startsWith('•') || line.startsWith('-')) {
                        html += `<p class="change-item">${line}</p>`;
                    } else {
                        html += `<p>${line}</p>`;
                    }
                });
                html += '</div>';
            } else {
                html += `<p>${changes}</p>`;
            }
        } else if (Array.isArray(changes)) {
            html += '<ul>';
            changes.forEach(change => {
                html += `<li>${change}</li>`;
            });
            html += '</ul>';
        }
        
        entry.innerHTML = html;
        changeLogContent.appendChild(entry);
        changeLog.style.display = 'block';
    }

    // Process transcript
    processBtn.addEventListener('click', async function() {
        const transcript = rawTranscript.value.trim();
        
        if (!transcript) {
            showError('Please paste a transcript first.');
            return;
        }

        // Show loading state
        processBtn.disabled = true;
        processBtn.querySelector('.btn-text').style.display = 'none';
        processBtn.querySelector('.btn-loader').style.display = 'inline-block';
        hideError();

        // Show progress UI
        showProgress(0, 1, 'Starting...');

        try {
            // Create job
            const response = await fetch('/api/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ transcript: transcript })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Processing failed');
            }

            const jobId = data.job_id;
            const totalChunks = data.total_chunks;
            const estimatedTime = data.estimated_time || '';

            // Show initial progress with time estimate
            if (estimatedTime) {
                showProgress(0, totalChunks, `Starting... (Est. ${estimatedTime})`);
            }

            // Poll for job status
            await pollJobStatus(jobId, totalChunks, 'process', processBtn, estimatedTime);

        } catch (error) {
            hideProgress();
            showError('Error: ' + error.message);
            // Reset button state
            processBtn.disabled = false;
            processBtn.querySelector('.btn-text').style.display = 'inline-block';
            processBtn.querySelector('.btn-loader').style.display = 'none';
        }
    });

    // Poll job status
    async function pollJobStatus(jobId, totalChunks, jobType, button, estimatedTime = '') {
        const maxAttempts = 300; // 5 minutes max (300 * 1 second)
        let attempts = 0;
        let pollInterval;

        return new Promise((resolve, reject) => {
            pollInterval = setInterval(async () => {
                attempts++;

                try {
                    const statusUrl = jobType === 'process' 
                        ? `/api/process/${jobId}/status`
                        : jobType === 'verify-speakers'
                        ? `/api/verify-speakers/${jobId}/status`
                        : `/api/segment/${jobId}/status`;
                    
                    const response = await fetch(statusUrl);
                    const data = await response.json();

                    if (data.status === 'completed') {
                        clearInterval(pollInterval);
                        hideProgress();

                        // Handle different job types
                        if (jobType === 'process') {
                            cleanedTranscriptText = data.result.cleaned_transcript;
                            outputArea.innerHTML = cleanedTranscriptText.replace(/\n/g, '<br>');
                            
                            totalTokensUsed = data.result.tokens_used;
                            tokensUsed.textContent = totalTokensUsed.toLocaleString();
                            stats.style.display = 'block';

                            const changes = [
                                'Removed standalone "0" numbers after speaker labels',
                                'Applied bold formatting to speaker names',
                                'Converted analyst labels to company-only format (e.g., "Goldman Sachs Analyst")',
                                'Fixed obvious analyst firm name misspellings',
                                'Standardized speaker label format'
                            ];
                            addChangeLogEntry('Clean Transcript', changes);
                            
                            verifySpeakersBtn.style.display = 'inline-block';
                            segmentBtn.style.display = 'inline-block';
                            addDisclaimersBtn.style.display = 'inline-block';
                            copyBtn.style.display = 'inline-block';
                            downloadBtn.style.display = 'inline-block';
                        } else if (jobType === 'verify-speakers') {
                            cleanedTranscriptText = data.result.verified_transcript;
                            outputArea.innerHTML = cleanedTranscriptText.replace(/\n/g, '<br>');
                            
                            totalTokensUsed += data.result.tokens_used;
                            tokensUsed.textContent = totalTokensUsed.toLocaleString();

                            if (data.result.changes_summary) {
                                addChangeLogEntry('Verify Speakers', data.result.changes_summary);
                            } else {
                                addChangeLogEntry('Verify Speakers', 'Verified speaker attributions and corrected any misplaced labels');
                            }

                            const originalText = button.querySelector('.btn-text').textContent;
                            button.querySelector('.btn-text').textContent = '✓ Speakers Verified!';
                            setTimeout(() => {
                                button.querySelector('.btn-text').textContent = originalText;
                            }, 3000);
                        } else if (jobType === 'segment') {
                            cleanedTranscriptText = data.result.segmented_transcript;
                            outputArea.innerHTML = cleanedTranscriptText.replace(/\n/g, '<br>');
                            
                            totalTokensUsed += data.result.tokens_used;
                            tokensUsed.textContent = totalTokensUsed.toLocaleString();

                            const originalText = button.querySelector('.btn-text').textContent;
                            button.querySelector('.btn-text').textContent = '✓ Segmented!';
                            setTimeout(() => {
                                button.querySelector('.btn-text').textContent = originalText;
                            }, 3000);
                        }

                        // Reset button state
                        button.disabled = false;
                        button.querySelector('.btn-text').style.display = 'inline-block';
                        button.querySelector('.btn-loader').style.display = 'none';

                        resolve();
                    } else if (data.status === 'failed') {
                        clearInterval(pollInterval);
                        hideProgress();
                        showError('Processing failed: ' + (data.error || 'Unknown error'));
                        button.disabled = false;
                        button.querySelector('.btn-text').style.display = 'inline-block';
                        button.querySelector('.btn-loader').style.display = 'none';
                        reject(new Error(data.error || 'Processing failed'));
                    } else if (data.status === 'processing' || data.status === 'pending') {
                        // Update progress
                        const currentChunk = data.progress.currentChunk || 0;
                        const progressPercent = totalChunks > 0 ? (currentChunk / totalChunks) * 100 : 0;
                        const message = estimatedTime 
                            ? `${data.progress.message || 'Processing...'} (Est. ${estimatedTime})`
                            : (data.progress.message || 'Processing...');
                        showProgress(currentChunk, totalChunks, message);
                    }
                } catch (error) {
                    clearInterval(pollInterval);
                    hideProgress();
                    showError('Error checking job status: ' + error.message);
                    button.disabled = false;
                    button.querySelector('.btn-text').style.display = 'inline-block';
                    button.querySelector('.btn-loader').style.display = 'none';
                    reject(error);
                }

                if (attempts >= maxAttempts) {
                    clearInterval(pollInterval);
                    hideProgress();
                    showError('Processing timed out. Please try again.');
                    button.disabled = false;
                    button.querySelector('.btn-text').style.display = 'inline-block';
                    button.querySelector('.btn-loader').style.display = 'none';
                    reject(new Error('Processing timed out'));
                }
            }, 1000); // Poll every second
        });
    }

    // Show progress UI
    function showProgress(current, total, message) {
        let progressContainer = document.getElementById('progressContainer');
        if (!progressContainer) {
            progressContainer = document.createElement('div');
            progressContainer.id = 'progressContainer';
            progressContainer.className = 'progress-container';
            outputArea.parentNode.insertBefore(progressContainer, outputArea);
        }

        const progressPercent = total > 0 ? (current / total) * 100 : 0;
        progressContainer.innerHTML = `
            <div class="progress-info">
                <span class="progress-message">${message}</span>
                <span class="progress-stats">${current} / ${total}</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progressPercent}%"></div>
            </div>
        `;
        progressContainer.style.display = 'block';
    }

    // Hide progress UI
    function hideProgress() {
        const progressContainer = document.getElementById('progressContainer');
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
    }

    // Verify speaker attribution
    verifySpeakersBtn.addEventListener('click', async function() {
        if (!cleanedTranscriptText) {
            showError('No transcript to verify.');
            return;
        }

        // Show loading state
        verifySpeakersBtn.disabled = true;
        verifySpeakersBtn.querySelector('.btn-text').style.display = 'none';
        verifySpeakersBtn.querySelector('.btn-loader').style.display = 'inline-block';
        hideError();

        // Show progress UI
        showProgress(0, 1, 'Starting...');

        try {
            // Create job
            const response = await fetch('/api/verify-speakers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ transcript: cleanedTranscriptText })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Speaker verification failed');
            }

            const jobId = data.job_id;
            const totalChunks = data.total_chunks;
            const estimatedTime = data.estimated_time || '';

            // Show initial progress with time estimate
            if (estimatedTime) {
                showProgress(0, totalChunks, `Starting... (Est. ${estimatedTime})`);
            }

            // Poll for job status
            await pollJobStatus(jobId, totalChunks, 'verify-speakers', verifySpeakersBtn, estimatedTime);

        } catch (error) {
            hideProgress();
            showError('Error: ' + error.message);
            // Reset button state
            verifySpeakersBtn.disabled = false;
            verifySpeakersBtn.querySelector('.btn-text').style.display = 'inline-block';
            verifySpeakersBtn.querySelector('.btn-loader').style.display = 'none';
        }
    });

    // Segment transcript
    segmentBtn.addEventListener('click', async function() {
        if (!cleanedTranscriptText) {
            showError('No transcript to segment.');
            return;
        }

        // Show loading state
        segmentBtn.disabled = true;
        segmentBtn.querySelector('.btn-text').style.display = 'none';
        segmentBtn.querySelector('.btn-loader').style.display = 'inline-block';
        hideError();

        // Show progress UI
        showProgress(0, 1, 'Starting...');

        try {
            // Create job
            const response = await fetch('/api/segment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ transcript: cleanedTranscriptText })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Segmentation failed');
            }

            const jobId = data.job_id;
            const totalChunks = data.total_chunks;
            const estimatedTime = data.estimated_time || '';

            // Show initial progress with time estimate
            if (estimatedTime) {
                showProgress(0, totalChunks, `Starting... (Est. ${estimatedTime})`);
            }

            // Poll for job status
            await pollJobStatus(jobId, totalChunks, 'segment', segmentBtn, estimatedTime);

        } catch (error) {
            hideProgress();
            showError('Error: ' + error.message);
            // Reset button state
            segmentBtn.disabled = false;
            segmentBtn.querySelector('.btn-text').style.display = 'inline-block';
            segmentBtn.querySelector('.btn-loader').style.display = 'none';
        }
    });

    // Add disclaimers
    addDisclaimersBtn.addEventListener('click', function() {
        if (!cleanedTranscriptText) {
            showError('No transcript to add disclaimers to.');
            return;
        }

        if (hasDisclaimers) {
            showError('Disclaimers already added.');
            return;
        }

        const topDisclaimer = `<div class="disclaimer">This transcript is brought to you by Benzinga APIs. For real-time access to our entire catalog, <a href="https://www.benzinga.com/apis/" target="_blank">please visit Benzinga APIs</a> for a consultation.</div>`;
        
        const bottomDisclaimer = `<div class="disclaimer">This transcript is to be used for informational purposes only. Though Benzinga believes the content to be substantially and directionally correct, Benzinga cannot and does not guarantee 100% accuracy of the content herein. Audio quality, accents, and technical issues could impact the exactness and we advise you to refer to source audio files before making any decisions based upon the above.</div>`;

        const transcriptWithDisclaimers = topDisclaimer + '<br>' + cleanedTranscriptText.replace(/\n/g, '<br>') + '<br>' + bottomDisclaimer;
        
        outputArea.innerHTML = transcriptWithDisclaimers;
        
        // Update the cleaned text to include disclaimers in HTML format for WordPress
        const topDisclaimerHTML = '<p><em>This transcript is brought to you by Benzinga APIs. For real-time access to our entire catalog, <a href="https://www.benzinga.com/apis/">please visit Benzinga APIs</a> for a consultation.</em></p>\n\n';
        const bottomDisclaimerHTML = '\n\n<p><em>This transcript is to be used for informational purposes only. Though Benzinga believes the content to be substantially and directionally correct, Benzinga cannot and does not guarantee 100% accuracy of the content herein. Audio quality, accents, and technical issues could impact the exactness and we advise you to refer to source audio files before making any decisions based upon the above.</em></p>';
        
        cleanedTranscriptText = topDisclaimerHTML + cleanedTranscriptText + bottomDisclaimerHTML;
        hasDisclaimers = true;

        // Change button text
        addDisclaimersBtn.textContent = '✓ Disclaimers Added';
        addDisclaimersBtn.disabled = true;
    });

    // Clear all
    clearBtn.addEventListener('click', function() {
        rawTranscript.value = '';
        outputArea.innerHTML = '<p class="placeholder-text">Cleaned transcript will appear here...</p>';
        cleanedTranscriptText = '';
        totalTokensUsed = 0;
        hasDisclaimers = false;
        verifySpeakersBtn.style.display = 'none';
        segmentBtn.style.display = 'none';
        addDisclaimersBtn.style.display = 'none';
        addDisclaimersBtn.disabled = false;
        addDisclaimersBtn.textContent = 'Add Disclaimers';
        copyBtn.style.display = 'none';
        downloadBtn.style.display = 'none';
        stats.style.display = 'none';
        changeLog.style.display = 'none';
        changeLogContent.innerHTML = '';
        hideProgress();
        hideError();
    });

    // Copy to clipboard
    copyBtn.addEventListener('click', async function() {
        console.log('Copy button clicked!');
        console.log('cleanedTranscriptText length:', cleanedTranscriptText.length);
        
        if (!cleanedTranscriptText) {
            showError('No transcript to copy.');
            return;
        }

        try {
            console.log('Attempting to copy...');
            // Always copy as HTML to preserve bold formatting for WordPress
            const htmlContent = cleanedTranscriptText;
            
            // Simple text copy (most reliable)
            await navigator.clipboard.writeText(htmlContent);
            console.log('Copy successful!');
            
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✓ Copied!';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        } catch (error) {
            console.error('Copy error:', error);
            showError('Failed to copy to clipboard. Error: ' + error.message);
        }
    });

    // Download as text file
    downloadBtn.addEventListener('click', function() {
        const blob = new Blob([cleanedTranscriptText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cleaned_transcript_${new Date().getTime()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    function showError(message) {
        errorMsg.textContent = message;
        errorMsg.style.display = 'block';
    }

    function hideError() {
        errorMsg.style.display = 'none';
    }
});

