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
            html += `<p>${changes}</p>`;
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

            // Poll for job status
            await pollJobStatus(jobId, totalChunks);

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
    async function pollJobStatus(jobId, totalChunks) {
        const maxAttempts = 300; // 5 minutes max (300 * 1 second)
        let attempts = 0;
        let pollInterval;

        return new Promise((resolve, reject) => {
            pollInterval = setInterval(async () => {
                attempts++;

                try {
                    const response = await fetch(`/api/process/${jobId}/status`);
                    const data = await response.json();

                    if (data.status === 'completed') {
                        clearInterval(pollInterval);
                        hideProgress();

                        // Display cleaned transcript
                        cleanedTranscriptText = data.result.cleaned_transcript;
                        outputArea.innerHTML = cleanedTranscriptText.replace(/\n/g, '<br>');
                        
                        // Show stats
                        totalTokensUsed = data.result.tokens_used;
                        tokensUsed.textContent = totalTokensUsed.toLocaleString();
                        stats.style.display = 'block';

                        // Log changes
                        const changes = [
                            'Removed standalone "0" numbers after speaker labels',
                            'Applied bold formatting to speaker names',
                            'Converted analyst labels to company-only format (e.g., "Goldman Sachs Analyst")',
                            'Fixed obvious analyst firm name misspellings',
                            'Standardized speaker label format'
                        ];
                        addChangeLogEntry('Clean Transcript', changes);
                        
                        // Show action buttons
                        verifySpeakersBtn.style.display = 'inline-block';
                        segmentBtn.style.display = 'inline-block';
                        addDisclaimersBtn.style.display = 'inline-block';
                        copyBtn.style.display = 'inline-block';
                        downloadBtn.style.display = 'inline-block';

                        // Reset button state
                        processBtn.disabled = false;
                        processBtn.querySelector('.btn-text').style.display = 'inline-block';
                        processBtn.querySelector('.btn-loader').style.display = 'none';

                        resolve();
                    } else if (data.status === 'failed') {
                        clearInterval(pollInterval);
                        hideProgress();
                        showError('Processing failed: ' + (data.error || 'Unknown error'));
                        processBtn.disabled = false;
                        processBtn.querySelector('.btn-text').style.display = 'inline-block';
                        processBtn.querySelector('.btn-loader').style.display = 'none';
                        reject(new Error(data.error || 'Processing failed'));
                    } else if (data.status === 'processing' || data.status === 'pending') {
                        // Update progress
                        const currentChunk = data.progress.currentChunk || 0;
                        const progressPercent = totalChunks > 0 ? (currentChunk / totalChunks) * 100 : 0;
                        showProgress(currentChunk, totalChunks, data.progress.message || 'Processing...');
                    }
                } catch (error) {
                    clearInterval(pollInterval);
                    hideProgress();
                    showError('Error checking job status: ' + error.message);
                    processBtn.disabled = false;
                    processBtn.querySelector('.btn-text').style.display = 'inline-block';
                    processBtn.querySelector('.btn-loader').style.display = 'none';
                    reject(error);
                }

                if (attempts >= maxAttempts) {
                    clearInterval(pollInterval);
                    hideProgress();
                    showError('Processing timed out. Please try again.');
                    processBtn.disabled = false;
                    processBtn.querySelector('.btn-text').style.display = 'inline-block';
                    processBtn.querySelector('.btn-loader').style.display = 'none';
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

        // Check transcript size and warn if large
        const charCount = cleanedTranscriptText.length;
        if (charCount > 40000) {
            const proceed = confirm(`This transcript is ${Math.round(charCount/1000)}K characters. Speaker verification may take 60-120 seconds. Continue?`);
            if (!proceed) return;
        }

        // Show loading state
        verifySpeakersBtn.disabled = true;
        verifySpeakersBtn.querySelector('.btn-text').style.display = 'none';
        verifySpeakersBtn.querySelector('.btn-loader').style.display = 'inline-block';
        hideError();

        try {
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

            // Update with verified transcript
            cleanedTranscriptText = data.verified_transcript;
            outputArea.innerHTML = cleanedTranscriptText.replace(/\n/g, '<br>');
            
            // Update token count
            totalTokensUsed += data.tokens_used;
            tokensUsed.textContent = totalTokensUsed.toLocaleString();

            // Log changes
            if (data.changes_summary) {
                addChangeLogEntry('Verify Speakers', data.changes_summary);
            } else {
                addChangeLogEntry('Verify Speakers', 'Verified speaker attributions and corrected any misplaced labels');
            }

            // Show success message briefly
            const originalText = verifySpeakersBtn.querySelector('.btn-text').textContent;
            verifySpeakersBtn.querySelector('.btn-text').textContent = '✓ Speakers Verified!';
            setTimeout(() => {
                verifySpeakersBtn.querySelector('.btn-text').textContent = originalText;
            }, 3000);

        } catch (error) {
            showError('Error: ' + error.message);
        } finally {
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

        try {
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

            // Update with segmented transcript
            cleanedTranscriptText = data.segmented_transcript;
            outputArea.innerHTML = cleanedTranscriptText.replace(/\n/g, '<br>');
            
            // Update token count
            totalTokensUsed += data.tokens_used;
            tokensUsed.textContent = totalTokensUsed.toLocaleString();

            // Show success message briefly
            const originalText = segmentBtn.querySelector('.btn-text').textContent;
            segmentBtn.querySelector('.btn-text').textContent = '✓ Segmented!';
            setTimeout(() => {
                segmentBtn.querySelector('.btn-text').textContent = originalText;
            }, 3000);

        } catch (error) {
            showError('Error: ' + error.message);
        } finally {
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

