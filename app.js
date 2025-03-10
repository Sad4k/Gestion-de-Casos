import { createApp, ref, computed, watch, onMounted } from 'vue';

createApp({
    setup() {
        // New authentication state and login form
        const isAuthenticated = ref(false);
        const loginForm = ref({
            username: '',
            password: ''
        });
        const errorLogin = ref('');

        const login = () => {
            // Hard-coded credentials for demo purposes; in a real app, use secure authentication methods.
            if (loginForm.value.username === 'admin' && loginForm.value.password === 'admin123') {
                isAuthenticated.value = true;
                sessionStorage.setItem('isLoggedIn', 'true');
                errorLogin.value = '';
                // Clear login form fields
                loginForm.value.username = '';
                loginForm.value.password = '';
            } else {
                errorLogin.value = 'Credenciales incorrectas. Inténtalo de nuevo.';
            }
        };

        const logout = () => {
            isAuthenticated.value = false;
            sessionStorage.removeItem('isLoggedIn');
        };

        // Existing reactive states and methods
        const casos = ref([]);
        const selectedCase = ref(null);
        const searchQuery = ref('');
        const currentView = ref('dashboard');

        // Modal states
        const showModal = ref(false);
        const showStepModal = ref(false);
        const showDeleteModal = ref(false);
        const showFileViewerModal = ref(false);
        const showCloseCaseModal = ref(false);
        const showEditStepModal = ref(false);
        const showDeleteStepModal = ref(false);
        const showConfigModal = ref(false);
        const showResetConfirmModal = ref(false);

        // File handling states
        const attachmentFiles = ref([]);
        const closeCaseFiles = ref([]);
        const currentViewingFile = ref(null);

        // Step editing state
        const currentStepIndex = ref(null);

        // Form states
        const modalTitle = ref('Nuevo Caso');
        const caseForm = ref({
            titulo: '',
            descripcion: '',
            estado: 'abierto',
            referencias: [''],
            pendienteDeContacto: '' 
        });
        const stepForm = ref({
            titulo: '',
            descripcion: '',
            fecha: new Date().toISOString(),
            adjuntos: [],
            pendienteDeContacto: '' 
        });

        // Notification system
        const notification = ref({
            show: false,
            type: 'success',
            message: '',
            progress: 100,
            timeout: null
        });

        // onMounted: load authentication state and cases
        onMounted(() => {
            if (sessionStorage.getItem('isLoggedIn') === 'true') {
                isAuthenticated.value = true;
            }
            const savedCases = localStorage.getItem('casos');
            if (savedCases) {
                try {
                    casos.value = JSON.parse(savedCases);
                } catch (e) {
                    showNotification('error', 'Error al cargar casos guardados');
                }
            } else {
                casos.value = [
                    {
                        id: 1,
                        titulo: 'Ejemplo de Caso',
                        descripcion: 'Este es un ejemplo de caso para mostrar cómo funciona la aplicación.',
                        estado: 'abierto',
                        fechaCreacion: new Date().toISOString(),
                        referencias: ['Ref-2023-001', 'Documento A-123'],
                        historial: [
                            {
                                titulo: 'Caso abierto',
                                descripcion: 'Se inició el caso en el sistema.',
                                fecha: new Date().toISOString()
                            }
                        ]
                    }
                ];
                saveCasesToLocalStorage();
            }
        });

        // Computed property for filtered cases
        const filteredCases = computed(() => {
            if (!searchQuery.value.trim()) return casos.value;
            
            const query = searchQuery.value.toLowerCase();
            return casos.value.filter(caso => 
                caso.titulo.toLowerCase().includes(query) || 
                caso.descripcion.toLowerCase().includes(query) ||
                caso.id.toString().includes(query)
            );
        });

        // Function to save cases to localStorage
        const saveCasesToLocalStorage = () => {
            localStorage.setItem('casos', JSON.stringify(casos.value));
        };

        // Helper function to generate a unique ID
        const generateId = () => {
            const existingIds = casos.value.map(caso => caso.id);
            if (existingIds.length === 0) return 1;
            return Math.max(...existingIds) + 1;
        };

        // Dashboard calculations
        const dashboardStats = computed(() => {
            const total = casos.value.length;
            const byStatus = {
                abierto: 0,
                'en-proceso': 0,
                pendiente: 0,
                resuelto: 0,
                cerrado: 0
            };
            
            // Count cases by status
            casos.value.forEach(caso => {
                if (byStatus.hasOwnProperty(caso.estado)) {
                    byStatus[caso.estado]++;
                }
            });
            
            // Calculate percentages
            const percentages = {};
            for (const status in byStatus) {
                percentages[status] = total > 0 ? (byStatus[status] / total) * 100 : 0;
            }
            
            // Get recent cases (last 5)
            const recentCases = [...casos.value]
                .sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion))
                .slice(0, 5);
                
            // Get cases pending external contact but group by person
            const pendingContactsByPerson = {};
            
            casos.value.forEach(caso => {
                // Check the case itself
                if (caso.pendienteDeContacto && caso.pendienteDeContacto.trim() !== '') {
                    if (!pendingContactsByPerson[caso.pendienteDeContacto]) {
                        pendingContactsByPerson[caso.pendienteDeContacto] = [];
                    }
                    pendingContactsByPerson[caso.pendienteDeContacto].push({
                        id: caso.id,
                        titulo: caso.titulo,
                        descripcion: caso.descripcion,
                        estado: caso.estado,
                        fromMainCase: true
                    });
                }
                
                // Check the case history steps
                if (caso.historial && caso.historial.length) {
                    caso.historial.forEach(step => {
                        if (step.pendienteDeContacto && step.pendienteDeContacto.trim() !== '') {
                            if (!pendingContactsByPerson[step.pendienteDeContacto]) {
                                pendingContactsByPerson[step.pendienteDeContacto] = [];
                            }
                            
                            // Only add the case if it's not already in the array for this person
                            const existingCase = pendingContactsByPerson[step.pendienteDeContacto]
                                .find(c => c.id === caso.id && c.stepTitle === step.titulo);
                                
                            if (!existingCase) {
                                pendingContactsByPerson[step.pendienteDeContacto].push({
                                    id: caso.id,
                                    titulo: caso.titulo,
                                    descripcion: caso.descripcion,
                                    estado: caso.estado,
                                    stepTitle: step.titulo,
                                    stepDescription: step.descripcion
                                });
                            }
                        }
                    });
                }
            });
            
            // Convert to array format for easier use in the template
            const pendingContactsArray = Object.keys(pendingContactsByPerson).map(person => ({
                person,
                cases: pendingContactsByPerson[person]
            }));
            
            return {
                total,
                byStatus,
                percentages,
                recentCases,
                pendingContactsArray,
                openCases: byStatus.abierto + byStatus['en-proceso'] + byStatus.pendiente,
                resolvedCases: byStatus.resuelto + byStatus.cerrado
            };
        });

        // Case CRUD operations
        const showNewCaseModal = () => {
            modalTitle.value = 'Nuevo Caso';
            caseForm.value = {
                titulo: '',
                descripcion: '',
                estado: 'abierto',
                referencias: [''],
                pendienteDeContacto: ''
            };
            showModal.value = true;
        };

        const editCase = () => {
            if (!selectedCase.value) return;
            if (selectedCase.value.estado === 'cerrado') {
                showNotification('error', 'No se puede editar un caso cerrado');
                return;
            }
            
            modalTitle.value = 'Editar Caso';
            caseForm.value = {
                titulo: selectedCase.value.titulo,
                descripcion: selectedCase.value.descripcion,
                estado: selectedCase.value.estado,
                referencias: [...selectedCase.value.referencias] || [''],
                pendienteDeContacto: selectedCase.value.pendienteDeContacto || ''
            };
            showModal.value = true;
        };

        const saveCase = () => {
            if (!caseForm.value.titulo.trim() || !caseForm.value.descripcion.trim()) {
                showNotification('error', 'Por favor complete todos los campos obligatorios');
                return;
            }

            // Filter out empty references
            const cleanReferences = caseForm.value.referencias.filter(ref => ref.trim() !== '');
            
            if (modalTitle.value === 'Nuevo Caso') {
                // Create new case
                const newCase = {
                    id: generateId(),
                    titulo: caseForm.value.titulo,
                    descripcion: caseForm.value.descripcion,
                    estado: caseForm.value.estado,
                    fechaCreacion: new Date().toISOString(),
                    referencias: cleanReferences,
                    pendienteDeContacto: caseForm.value.pendienteDeContacto || '',
                    historial: [
                        {
                            titulo: 'Caso abierto',
                            descripcion: 'Se inició el caso en el sistema.',
                            fecha: new Date().toISOString()
                        }
                    ]
                };
                
                casos.value.push(newCase);
                selectedCase.value = newCase;
                showNotification('success', 'Caso creado correctamente');
            } else {
                // Update existing case
                const index = casos.value.findIndex(c => c.id === selectedCase.value.id);
                if (index !== -1) {
                    casos.value[index] = {
                        ...casos.value[index],
                        titulo: caseForm.value.titulo,
                        descripcion: caseForm.value.descripcion,
                        estado: caseForm.value.estado,
                        referencias: cleanReferences,
                        pendienteDeContacto: caseForm.value.pendienteDeContacto || ''
                    };
                    
                    selectedCase.value = casos.value[index];
                    showNotification('success', 'Caso actualizado correctamente');
                }
            }
            
            saveCasesToLocalStorage();
            closeModal();
        };

        const confirmDeleteCase = () => {
            if (!selectedCase.value) return;
            if (selectedCase.value.estado === 'cerrado') {
                showNotification('error', 'No se puede eliminar un caso cerrado');
                return;
            }
            showDeleteModal.value = true;
        };

        const deleteCase = () => {
            if (!selectedCase.value) return;
            
            const index = casos.value.findIndex(c => c.id === selectedCase.value.id);
            if (index !== -1) {
                casos.value.splice(index, 1);
                selectedCase.value = null;
                saveCasesToLocalStorage();
                showNotification('success', 'Caso eliminado correctamente');
            }
            
            closeDeleteModal();
        };

        const selectCase = (caso) => {
            selectedCase.value = caso;
        };

        // Step management
        const showAddStepModal = () => {
            if (!selectedCase.value) return;
            if (selectedCase.value.estado === 'cerrado') {
                showNotification('error', 'No se pueden añadir pasos a un caso cerrado');
                return;
            }
            
            stepForm.value = {
                titulo: '',
                descripcion: '',
                fecha: new Date().toISOString(),
                adjuntos: [],
                pendienteDeContacto: ''
            };
            
            attachmentFiles.value = [];
            showStepModal.value = true;
        };

        const editStep = (index) => {
            if (!selectedCase.value || !selectedCase.value.historial) return;
            if (selectedCase.value.estado === 'cerrado') {
                showNotification('error', 'No se pueden editar pasos de un caso cerrado');
                return;
            }
            
            const paso = selectedCase.value.historial[index];
            if (!paso) return;
            
            currentStepIndex.value = index;
            stepForm.value = {
                titulo: paso.titulo,
                descripcion: paso.descripcion,
                fecha: paso.fecha,
                adjuntos: paso.adjuntos || [],
                pendienteDeContacto: paso.pendienteDeContacto || ''
            };
            
            attachmentFiles.value = paso.adjuntos ? [...paso.adjuntos] : [];
            showEditStepModal.value = true;
        };
        
        const confirmDeleteStep = (index) => {
            if (!selectedCase.value || !selectedCase.value.historial) return;
            if (selectedCase.value.estado === 'cerrado') {
                showNotification('error', 'No se pueden eliminar pasos de un caso cerrado');
                return;
            }
            
            currentStepIndex.value = index;
            showDeleteStepModal.value = true;
        };
        
        const deleteStep = () => {
            if (!selectedCase.value || currentStepIndex.value === null) return;
            
            const caseIndex = casos.value.findIndex(c => c.id === selectedCase.value.id);
            if (caseIndex === -1) return;
            
            const stepToDelete = selectedCase.value.historial[currentStepIndex.value];
            
            // Add a record of the deletion
            casos.value[caseIndex].historial.push({
                titulo: 'Paso eliminado',
                descripcion: `Se eliminó el paso "${stepToDelete.titulo}"`,
                fecha: new Date().toISOString(),
                isSystemAction: true
            });
            
            // Remove the step
            casos.value[caseIndex].historial.splice(currentStepIndex.value, 1);
            
            // Update the selected case reference
            selectedCase.value = casos.value[caseIndex];
            
            saveCasesToLocalStorage();
            showNotification('success', 'Paso eliminado correctamente');
            closeDeleteStepModal();
        };
        
        const updateStep = () => {
            if (!selectedCase.value || currentStepIndex.value === null) return;
            if (!stepForm.value.titulo.trim() || !stepForm.value.descripcion.trim()) {
                showNotification('error', 'Por favor complete todos los campos obligatorios');
                return;
            }
            
            const caseIndex = casos.value.findIndex(c => c.id === selectedCase.value.id);
            if (caseIndex === -1) return;
            
            const originalStep = {...selectedCase.value.historial[currentStepIndex.value]};
            
            // Process attachments
            const processedAdjuntos = attachmentFiles.value.map(file => {
                return {
                    nombre: file.nombre || file.name,
                    tipo: file.tipo || file.type,
                    tamano: file.tamano || file.size,
                    data: file.data
                };
            });
            
            // Update the step
            casos.value[caseIndex].historial[currentStepIndex.value] = {
                titulo: stepForm.value.titulo,
                descripcion: stepForm.value.descripcion,
                fecha: originalStep.fecha,
                adjuntos: processedAdjuntos,
                pendienteDeContacto: stepForm.value.pendienteDeContacto || '',
                lastEdited: new Date().toISOString()
            };
            
            // Add a record of the edit
            casos.value[caseIndex].historial.push({
                titulo: 'Paso editado',
                descripcion: `Se editó el paso "${originalStep.titulo}"`,
                fecha: new Date().toISOString(),
                isSystemAction: true
            });
            
            // Update the selected case reference
            selectedCase.value = casos.value[caseIndex];
            
            saveCasesToLocalStorage();
            showNotification('success', 'Paso actualizado correctamente');
            closeEditStepModal();
        };

        const saveStep = () => {
            if (!selectedCase.value) return;
            if (!stepForm.value.titulo.trim() || !stepForm.value.descripcion.trim()) {
                showNotification('error', 'Por favor complete todos los campos obligatorios');
                return;
            }
            
            const index = casos.value.findIndex(c => c.id === selectedCase.value.id);
            if (index !== -1) {
                // Create a new history array if it doesn't exist
                if (!casos.value[index].historial) {
                    casos.value[index].historial = [];
                }
                
                // Process attachments
                const processedAdjuntos = attachmentFiles.value.map(file => {
                    return {
                        nombre: file.name,
                        tipo: file.type,
                        tamano: file.size,
                        data: file.data
                    };
                });
                
                // Add new step to history
                casos.value[index].historial.push({
                    titulo: stepForm.value.titulo,
                    descripcion: stepForm.value.descripcion,
                    fecha: new Date().toISOString(),
                    adjuntos: processedAdjuntos,
                    pendienteDeContacto: stepForm.value.pendienteDeContacto || ''
                });
                
                // Update the selected case reference
                selectedCase.value = casos.value[index];
                
                saveCasesToLocalStorage();
                showNotification('success', 'Paso añadido correctamente');
                closeStepModal();
            }
        };

        // Reference management
        const addReference = () => {
            caseForm.value.referencias.push('');
        };

        const removeReference = (index) => {
            caseForm.value.referencias.splice(index, 1);
            
            // Make sure there's always at least one reference field
            if (caseForm.value.referencias.length === 0) {
                caseForm.value.referencias.push('');
            }
        };

        // Modal management
        const closeModal = () => {
            showModal.value = false;
        };
        
        const closeStepModal = () => {
            showStepModal.value = false;
        };
        
        const closeDeleteModal = () => {
            showDeleteModal.value = false;
        };

        const closeEditStepModal = () => {
            showEditStepModal.value = false;
            currentStepIndex.value = null;
        };
        
        const closeDeleteStepModal = () => {
            showDeleteStepModal.value = false;
            currentStepIndex.value = null;
        };

        // File handling functions
        const handleFileUpload = (event) => {
            const files = event.target.files;
            if (!files.length) return;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const reader = new FileReader();
                
                reader.onload = (e) => {
                    attachmentFiles.value.push({
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        data: e.target.result
                    });
                };
                
                reader.readAsDataURL(file);
            }
        };

        const removeAttachment = (index) => {
            attachmentFiles.value.splice(index, 1);
        };

        const formatFileSize = (bytes) => {
            if (bytes < 1024) return bytes + ' bytes';
            else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            else return (bytes / 1048576).toFixed(1) + ' MB';
        };

        const viewAttachment = (attachment) => {
            currentViewingFile.value = attachment;
            showFileViewerModal.value = true;
        };

        const closeFileViewer = () => {
            showFileViewerModal.value = false;
            currentViewingFile.value = null;
        };

        const getFileIcon = (fileType) => {
            if (fileType.includes('image')) {
                return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                    <path d="M21 15L16 10L6 20" stroke="currentColor" stroke-width="2"/>
                </svg>`;
            } else if (fileType.includes('pdf')) {
                return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2H6C4.89543 2 4 2.89543 4 4Z" stroke="currentColor" stroke-width="2"/>
                    <path d="M14 2V8H20" stroke="currentColor" stroke-width="2"/>
                    <path d="M9 15H15" stroke="currentColor" stroke-width="2"/>
                    <path d="M9 11H15" stroke="currentColor" stroke-width="2"/>
                </svg>`;
            } else if (fileType.includes('excel') || fileType.includes('sheet') || fileType.includes('csv')) {
                return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2H6C4.89543 2 4 2.89543 4 4Z" stroke="currentColor" stroke-width="2"/>
                    <path d="M14 2V8H20" stroke="currentColor" stroke-width="2"/>
                    <path d="M8 13H10V17H8V13Z" stroke="currentColor" stroke-width="2"/>
                    <path d="M14 13H16V17H14V13Z" stroke="currentColor" stroke-width="2"/>
                </svg>`;
            } else if (fileType.includes('word') || fileType.includes('document')) {
                return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2H6C4.89543 2 4 2.89543 4 4Z" stroke="currentColor" stroke-width="2"/>
                    <path d="M14 2V8H20" stroke="currentColor" stroke-width="2"/>
                    <path d="M8 12L16 12" stroke="currentColor" stroke-width="2"/>
                    <path d="M8 16L16 16" stroke="currentColor" stroke-width="2"/>
                </svg>`;
            } else if (fileType.includes('email') || fileType.includes('message')) {
                return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="2"/>
                    <path d="M22 7L13.03 14.2C12.42 14.68 11.58 14.68 10.97 14.2L2 7" stroke="currentColor" stroke-width="2"/>
                </svg>`;
            } else {
                return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2H6C4.89543 2 4 2.89543 4 4Z" stroke="currentColor" stroke-width="2"/>
                    <path d="M14 2V8H20" stroke="currentColor" stroke-width="2"/>
                </svg>`;
            }
        };

        // Utility functions
        const formatDate = (dateString) => {
            if (!dateString) return '';
            
            const date = new Date(dateString);
            return new Intl.DateTimeFormat('es', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(date);
        };
        
        const truncateText = (text, maxLength) => {
            if (!text) return '';
            return text.length > maxLength
                ? text.substring(0, maxLength) + '...'
                : text;
        };

        // Notification system
        const showNotification = (type, message, duration = 5000) => {
            // Clear previous notification timeout if exists
            if (notification.value.timeout) {
                clearTimeout(notification.value.timeout);
                clearInterval(notification.value.interval);
            }
            
            // Set up new notification
            notification.value = {
                show: true,
                type,
                message,
                progress: 100,
                timeout: null,
                interval: null
            };
            
            // Progress bar animation
            const step = 100 / (duration / 100);
            notification.value.interval = setInterval(() => {
                notification.value.progress -= step;
                if (notification.value.progress <= 0) {
                    clearInterval(notification.value.interval);
                }
            }, 100);
            
            // Auto-hide notification after duration
            notification.value.timeout = setTimeout(() => {
                notification.value.show = false;
            }, duration);
        };

        // Navigation function
        const navigateTo = (view) => {
            currentView.value = view;
        };

        const closeCase = () => {
            if (!selectedCase.value) return;
            if (selectedCase.value.estado === 'cerrado') {
                showNotification('error', 'Este caso ya está cerrado');
                return;
            }
            
            closeCaseFiles.value = [];
            showCloseCaseModal.value = true;
        };
        
        const confirmCloseCase = () => {
            if (!selectedCase.value) return;

            const index = casos.value.findIndex(c => c.id === selectedCase.value.id);
            if (index !== -1) {
                // Process attachments for closure evidence
                const processedAdjuntos = closeCaseFiles.value.map(file => {
                    return {
                        nombre: file.name,
                        tipo: file.type,
                        tamano: file.size,
                        data: file.data
                    };
                });
                
                // Change case status to closed
                casos.value[index].estado = 'cerrado';
                
                // Add closure step to history with evidence
                if (!casos.value[index].historial) {
                    casos.value[index].historial = [];
                }
                
                casos.value[index].historial.push({
                    titulo: 'Caso cerrado',
                    descripcion: 'Se ha cerrado el caso con la evidencia correspondiente.',
                    fecha: new Date().toISOString(),
                    adjuntos: processedAdjuntos
                });
                
                // Update the selected case reference
                selectedCase.value = casos.value[index];
                
                saveCasesToLocalStorage();
                showNotification('success', 'Caso cerrado correctamente');
                closeCloseCaseModal();
            }
        };
        
        const closeCloseCaseModal = () => {
            showCloseCaseModal.value = false;
        };

        const handleCloseCaseFileUpload = (event) => {
            const files = event.target.files;
            if (!files.length) return;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const reader = new FileReader();
                
                reader.onload = (e) => {
                    closeCaseFiles.value.push({
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        data: e.target.result
                    });
                };
                
                reader.readAsDataURL(file);
            }
        };

        const removeCloseCaseFile = (index) => {
            closeCaseFiles.value.splice(index, 1);
        };

        // Reset application data
        const resetAllData = () => {
            casos.value = [
                {
                    id: 1,
                    titulo: 'Ejemplo de Caso',
                    descripcion: 'Este es un ejemplo de caso para mostrar cómo funciona la aplicación.',
                    estado: 'abierto',
                    fechaCreacion: new Date().toISOString(),
                    referencias: ['Ref-2023-001', 'Documento A-123'],
                    historial: [
                        {
                            titulo: 'Caso abierto',
                            descripcion: 'Se inició el caso en el sistema.',
                            fecha: new Date().toISOString()
                        }
                    ]
                }
            ];
            selectedCase.value = null;
            saveCasesToLocalStorage();
            showNotification('success', 'Datos restablecidos correctamente');
            closeResetConfirmModal();
            closeConfigModal();
        };

        const openConfigModal = () => {
            showConfigModal.value = true;
        };

        const closeConfigModal = () => {
            showConfigModal.value = false;
        };

        const openResetConfirmModal = () => {
            showResetConfirmModal.value = true;
            closeConfigModal();
        };

        const closeResetConfirmModal = () => {
            showResetConfirmModal.value = false;
        };

        // Return the state and methods
        return {
            // Authentication state and methods
            isAuthenticated,
            loginForm,
            errorLogin,
            login,
            logout,
            // Existing state and methods
            casos,
            selectedCase,
            searchQuery,
            filteredCases,
            showModal,
            showStepModal,
            showDeleteModal,
            showFileViewerModal,
            showCloseCaseModal,
            showEditStepModal,
            showDeleteStepModal,
            showConfigModal,
            showResetConfirmModal,
            modalTitle,
            caseForm,
            stepForm,
            notification,
            currentView,
            dashboardStats,
            attachmentFiles,
            closeCaseFiles,
            currentViewingFile,
            currentStepIndex,
            // Case methods
            showNewCaseModal,
            editCase,
            saveCase,
            confirmDeleteCase,
            deleteCase,
            selectCase,
            closeCase,
            confirmCloseCase,
            closeCloseCaseModal,
            // Step methods
            showAddStepModal,
            editStep,
            saveStep,
            updateStep,
            confirmDeleteStep,
            deleteStep,
            // File methods
            handleFileUpload,
            handleCloseCaseFileUpload,
            removeAttachment,
            removeCloseCaseFile,
            viewAttachment,
            closeFileViewer,
            formatFileSize,
            getFileIcon,
            // Reference methods
            addReference,
            removeReference,
            // Navigation method
            navigateTo,
            // Modal methods
            closeModal,
            closeStepModal,
            closeDeleteModal,
            closeEditStepModal,
            closeDeleteStepModal,
            // Utility methods
            formatDate,
            truncateText,
            // Configuration methods
            openConfigModal,
            closeConfigModal,
            openResetConfirmModal,
            closeResetConfirmModal,
            resetAllData,
        };
    }
}).mount('#app');