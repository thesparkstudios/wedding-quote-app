import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, addDoc, collection, onSnapshot, query, where } from 'firebase/firestore';

// Define Firebase configuration (will be populated by Canvas runtime)
// Explicitly declare these variables to satisfy ESLint during local build.
let firebaseConfig = {};
if (typeof __firebase_config !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
}

// Define app ID (will be populated by Canvas runtime)
let appId = 'default-app-id';
if (typeof __app_id !== 'undefined') {
    appId = __app_id;
}

// Define initial auth token (will be populated by Canvas runtime)
let initialAuthToken = null;
if (typeof __initial_auth_token !== 'undefined') {
    initialAuthToken = __initial_auth_token;
}

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Collection reference for public quotes
const quotesCollectionRef = collection(db, `artifacts/${appId}/public/data/weddingQuotes`);

// Main App component
const App = () => {
    // State for Firebase and user
    const [firebaseDb, setFirebaseDb] = useState(null);
    const [firebaseAuth, setFirebaseAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [authError, setAuthError] = useState('');

    // State to manage the current quote details (for creation or viewing)
    const [quoteDetails, setQuoteDetails] = useState({
        clientName: '',
        packageName: 'Custom Package',
        basePrice: 0,
        addOns: [],
        inclusions: [
            { id: 'droneUpgrade', text: 'Drone upgrade included', value: 450, isValueAdded: true },
            { id: 'highRes', text: 'High-resolution Photos and Videos', isValueAdded: false },
            { id: 'shootsWithinTimeframe', text: 'Photo shoots and video shoots within the above-mentioned time frame', isValueAdded: false },
            { id: 'highlightsFilm', text: '1 combined or separate wedding highlights film of all the events', isValueAdded: false },
            { id: 'fullLengthVideo', text: 'Separate full-length edited video of the day', isValueAdded: false },
            { id: 'onlineDeliveryApproval', text: 'Online video and photo delivery for approval', isValueAdded: false },
            { id: 'finalDelivery', text: 'Final Videos and Photos delivered in an online link or on a USB', isValueAdded: false }
        ],
        tableData: [
            { day: 'Day 1', hours: '4 hours', videographer: '1 Videographer (2 cameras)', photographer: '1 Photographer' },
            { day: 'Day 2', hours: '10 hours', videographer: '1 Videographer (2 cameras)', photographer: '1 Photographer' }
        ],
        companyEmail: 'info@thesparkstudios.ca'
    });

    // State for the generated email draft
    const [emailDraft, setEmailDraft] = useState('');
    // State for loading indicator during API calls (Gemini or Firestore)
    const [isLoading, setIsLoading] = useState(false);
    // State to control visibility of the email draft modal
    const [showEmailModal, setShowEmailModal] = useState(false);
    // State for any API error messages
    const [apiError, setApiError] = useState('');
    // State for copy to clipboard message
    const [copyMessage, setCopyMessage] = useState('');

    // State for the generated quote URL
    const [generatedQuoteUrl, setGeneratedQuoteUrl] = useState('');
    // State to determine if we are viewing an existing quote or creating a new one
    const [isViewingQuote, setIsViewingQuote] = useState(false);
    // State to hold the ID of the quote being viewed
    const [currentQuoteId, setCurrentQuoteId] = useState('');

    // --- Firebase Initialization and Authentication ---
    useEffect(() => {
        const initFirebase = async () => {
            try {
                // Sign in with custom token if available, otherwise anonymously
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Firebase Auth Error:", error);
                setAuthError(`Authentication failed: ${error.message}`);
            }
        };

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setUserId(user.uid);
                setFirebaseDb(db);
                setFirebaseAuth(auth);
                setIsAuthReady(true);
                setAuthError(''); // Clear auth error on successful sign-in
                console.log("Firebase initialized and user authenticated:", user.uid);
            } else {
                setUserId(null);
                setFirebaseDb(null);
                setFirebaseAuth(null);
                setIsAuthReady(true); // Still ready, just not authenticated
                console.log("Firebase auth state changed: No user.");
            }
        });

        initFirebase(); // Initialize Firebase and sign in

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, []);

    // --- URL Handling and Quote Loading ---
    useEffect(() => {
        // Only attempt to load quote if Firebase is ready
        if (isAuthReady && firebaseDb) {
            const urlParams = new URLSearchParams(window.location.search);
            const quoteIdFromUrl = urlParams.get('quoteId');

            if (quoteIdFromUrl) {
                setCurrentQuoteId(quoteIdFromUrl);
                setIsViewingQuote(true);
                loadQuote(quoteIdFromUrl);
            } else {
                // If no quoteId in URL, we are in creation mode
                setIsViewingQuote(false);
                setQuoteDetails({ // Reset to default new quote state
                    clientName: '',
                    packageName: 'Custom Package',
                    basePrice: 0,
                    addOns: [],
                    inclusions: [
                        { id: 'droneUpgrade', text: 'Drone upgrade included', value: 450, isValueAdded: true },
                        { id: 'highRes', text: 'High-resolution Photos and Videos', isValueAdded: false },
                        { id: 'shootsWithinTimeframe', text: 'Photo shoots and video shoots within the above-mentioned time frame', isValueAdded: false },
                        { id: 'highlightsFilm', text: '1 combined or separate wedding highlights film of all the events', isValueAdded: false },
                        { id: 'fullLengthVideo', text: 'Separate full-length edited video of the day', isValueAdded: false },
                        { id: 'onlineDeliveryApproval', text: 'Online video and photo delivery for approval', isValueAdded: false },
                        { id: 'finalDelivery', text: 'Final Videos and Photos delivered in an online link or on a USB', isValueAdded: false }
                    ],
                    tableData: [
                        { day: 'Day 1', hours: '4 hours', videographer: '1 Videographer (2 cameras)', photographer: '1 Photographer' },
                        { day: 'Day 2', hours: '10 hours', videographer: '1 Videographer (2 cameras)', photographer: '1 Photographer' }
                    ],
                    companyEmail: 'info@thesparkstudios.ca'
                });
                setGeneratedQuoteUrl(''); // Clear any old generated URL
            }
        }
    }, [isAuthReady, firebaseDb]); // Rerun when auth is ready or db instance changes

    // --- Data Input Handlers ---
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setQuoteDetails(prevDetails => ({
            ...prevDetails,
            [name]: name === 'basePrice' ? parseFloat(value) || 0 : value
        }));
    };

    const handleTableDataChange = (index, field, value) => {
        setQuoteDetails(prevDetails => {
            const newTableData = [...prevDetails.tableData];
            newTableData[index] = { ...newTableData[index], [field]: value };
            return { ...prevDetails, tableData: newTableData };
        });
    };

    const handleAddAddOn = () => {
        setQuoteDetails(prevDetails => ({
            ...prevDetails,
            addOns: [...prevDetails.addOns, { id: Date.now().toString(), description: '', price: 0, hours: 0, selected: true }]
        }));
    };

    const handleAddOnInputChange = (index, field, value) => {
        setQuoteDetails(prevDetails => {
            const newAddOns = [...prevDetails.addOns];
            newAddOns[index] = {
                ...newAddOns[index],
                [field]: (field === 'price' || field === 'hours') ? parseFloat(value) || 0 : value
            };
            return { ...prevDetails, addOns: newAddOns };
        });
    };

    const handleRemoveAddOn = (idToRemove) => {
        setQuoteDetails(prevDetails => ({
            ...prevDetails,
            addOns: prevDetails.addOns.filter(addOn => addOn.id !== idToRemove)
        }));
    };

    // Calculate total price based on base price and selected add-ons
    const calculateTotalPrice = () => {
        let total = quoteDetails.basePrice;
        quoteDetails.addOns.forEach(addOn => {
            // Assuming all add-ons added are included in total for simplicity
            total += addOn.price;
        });
        return total;
    };

    // --- Firestore Operations ---
    const saveQuote = async () => {
        if (!firebaseDb || !userId) {
            setApiError("Firebase not ready or user not authenticated.");
            return;
        }

        setIsLoading(true);
        setApiError('');
        try {
            // Ensure necessary fields are not empty
            if (!quoteDetails.clientName || !quoteDetails.packageName || quoteDetails.basePrice === 0) {
                setApiError('Please fill in Client Name, Package Name, and Base Price.');
                setIsLoading(false);
                return;
            }

            const quoteDataToSave = {
                ...quoteDetails,
                createdAt: new Date().toISOString(),
                createdBy: userId,
            };

            // Add a new document with a generated ID
            const docRef = await addDoc(quotesCollectionRef, quoteDataToSave);
            const url = `${window.location.origin}/?quoteId=${docRef.id}`;
            setGeneratedQuoteUrl(url);
            setCurrentQuoteId(docRef.id); // Set the current quote ID to the newly created one
            setIsViewingQuote(true); // Switch to viewing mode
            console.log("Document written with ID: ", docRef.id);
            setApiError(''); // Clear any previous errors
        } catch (e) {
            console.error("Error adding document: ", e);
            setApiError(`Failed to save quote: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const loadQuote = async (id) => {
        if (!firebaseDb) {
            setApiError("Firebase database not initialized.");
            return;
        }

        setIsLoading(true);
        setApiError('');
        try {
            const docRef = doc(db, `artifacts/${appId}/public/data/weddingQuotes`, id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                setQuoteDetails(docSnap.data());
                setGeneratedQuoteUrl(`${window.location.origin}/?quoteId=${id}`); // Re-set URL on load
                setApiError(''); // Clear any previous errors
            } else {
                console.log("No such document!");
                setApiError("Quote not found. Please check the URL.");
                setIsViewingQuote(false); // Go back to creation mode if quote not found
                // Clear quote details for new creation
                setQuoteDetails({
                    clientName: '', packageName: 'Custom Package', basePrice: 0, addOns: [],
                    inclusions: [
                        { id: 'droneUpgrade', text: 'Drone upgrade included', value: 450, isValueAdded: true },
                        { id: 'highRes', text: 'High-resolution Photos and Videos', isValueAdded: false },
                        { id: 'shootsWithinTimeframe', text: 'Photo shoots and video shoots within the above-mentioned time frame', isValueAdded: false },
                        { id: 'highlightsFilm', text: '1 combined or separate wedding highlights film of all the events', isValueAdded: false },
                        { id: 'fullLengthVideo', text: 'Separate full-length edited video of the day', isValueAdded: false },
                        { id: 'onlineDeliveryApproval', text: 'Online video and photo delivery for approval', isValueAdded: false },
                        { id: 'finalDelivery', text: 'Final Videos and Photos delivered in an online link or on a USB', isValueAdded: false }
                    ],
                    tableData: [
                        { day: 'Day 1', hours: '4 hours', videographer: '1 Videographer (2 cameras)', photographer: '1 Photographer' },
                        { day: 'Day 2', hours: '10 hours', videographer: '1 Videographer (2 cameras)', photographer: '1 Photographer' }
                    ],
                    companyEmail: 'info@thesparkstudios.ca'
                });
            }
        } catch (e) {
            console.error("Error getting document: ", e);
            setApiError(`Failed to load quote: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Function to generate the follow-up email using Gemini API
    const generateFollowUpEmail = async () => {
        setIsLoading(true);
        setApiError('');
        setEmailDraft(''); // Clear previous draft
        setCopyMessage(''); // Clear any previous copy messages

        const inclusionsList = quoteDetails.inclusions.map(item => item.text + (item.isValueAdded ? ` ($${item.value} value)` : '')).join(', ');
        const addOnsDescription = quoteDetails.addOns.length > 0
            ? quoteDetails.addOns.map(a => `${a.description} $${a.price}/${a.hours} hours`).join('; ')
            : 'No optional add-ons.';

        const prompt = `Draft a concise, friendly, and professional follow-up email to a wedding client named ${quoteDetails.clientName} regarding the photo and video quote provided.

        The quote details are:
        - Package Name: "${quoteDetails.packageName}"
        - Base Price: $${quoteDetails.basePrice}
        - Total Estimated Price (including listed add-ons): $${calculateTotalPrice()}
        - Included services: ${inclusionsList}.
        - Optional Add-ons discussed: ${addOnsDescription}.
        - Coverage details:
            ${quoteDetails.tableData.map(row => `- ${row.day}: ${row.hours} with ${row.videographer} and ${row.photographer}`).join('\n            ')}

        The email should:
        1. Acknowledge receipt of the quote (as if it was just sent or reviewed).
        2. Briefly recap the core offering (photo & video services).
        3. Reiterate the main value propositions or benefits.
        4. Invite them to ask any questions.
        5. Conclude with a warm closing.
        6. Use a professional and encouraging tone.
        7. The subject line should be "Following Up: Your Wedding Photo & Video Quote".
        `;

        let chatHistory = [];
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });
        const payload = { contents: chatHistory };
        const apiKey = ""; // Canvas will provide this at runtime if empty
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API error: ${response.status} - ${errorData.error ? errorData.error.message : response.statusText}`);
            }

            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const text = result.candidates[0].content.parts[0].text;
                setEmailDraft(text);
                setShowEmailModal(true); // Show modal after successful generation
            } else {
                setApiError('Failed to generate email: Unexpected API response format.');
            }
        } catch (error) {
            console.error("Error generating email:", error);
            setApiError(`Error generating email: ${error.message || 'Please try again.'}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Function to copy the email draft to clipboard
    const copyToClipboard = (textToCopy) => {
        if (textToCopy) {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = textToCopy;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                setCopyMessage('Copied to clipboard!');
            } catch (err) {
                console.error('Failed to copy text: ', err);
                setCopyMessage('Failed to copy. Please copy manually.');
            }
        }
    };

    // Show loading spinner if Firebase not ready
    if (!isAuthReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="flex flex-col items-center">
                    <svg className="animate-spin h-10 w-10 text-indigo-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-gray-700 text-lg">Initializing application...</p>
                    {authError && <p className="text-red-500 mt-2">{authError}</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-4 font-inter">
            {/* Display current user ID for debugging/sharing */}
            <div className="text-center text-sm text-gray-500 mb-4">
                User ID: <span className="font-mono">{userId}</span>
                {authError && <p className="text-red-500 mt-1">{authError}</p>}
            </div>

            {/* Main Container */}
            <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-xl overflow-hidden md:p-8 p-4">
                {/* Header Section */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">Photo & Video Quote</h1>
                    <p className="text-lg text-gray-600">// The Spark Studios</p>
                </div>

                {/* Quote Input Form (visible when not viewing an existing quote) */}
                {!isViewingQuote && (
                    <div className="mb-8 p-6 bg-blue-50 rounded-lg shadow-inner">
                        <h2 className="text-2xl font-semibold text-blue-700 mb-4">Create New Quote</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label htmlFor="clientName" className="block text-gray-700 text-sm font-bold mb-2">Client Name:</label>
                                <input
                                    type="text"
                                    id="clientName"
                                    name="clientName"
                                    value={quoteDetails.clientName}
                                    onChange={handleInputChange}
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-indigo-500"
                                    placeholder="e.g., Jane & John Doe"
                                />
                            </div>
                            <div>
                                <label htmlFor="packageName" className="block text-gray-700 text-sm font-bold mb-2">Package Name:</label>
                                <input
                                    type="text"
                                    id="packageName"
                                    name="packageName"
                                    value={quoteDetails.packageName}
                                    onChange={handleInputChange}
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-indigo-500"
                                    placeholder="e.g., Gold Wedding Package"
                                />
                            </div>
                            <div>
                                <label htmlFor="basePrice" className="block text-gray-700 text-sm font-bold mb-2">Base Price ($):</label>
                                <input
                                    type="number"
                                    id="basePrice"
                                    name="basePrice"
                                    value={quoteDetails.basePrice}
                                    onChange={handleInputChange}
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-indigo-500"
                                    placeholder="e.g., 4250"
                                />
                            </div>
                        </div>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3">Coverage Details:</h3>
                        {quoteDetails.tableData.map((row, index) => (
                            <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3 p-3 border rounded-lg bg-white shadow-sm">
                                <div>
                                    <label htmlFor={`day-${index}`} className="block text-gray-700 text-xs font-bold mb-1">Day:</label>
                                    <input
                                        type="text"
                                        id={`day-${index}`}
                                        value={row.day}
                                        onChange={(e) => handleTableDataChange(index, 'day', e.target.value)}
                                        className="shadow appearance-none border rounded w-full py-1 px-2 text-gray-700 text-sm leading-tight focus:outline-none focus:shadow-outline"
                                    />
                                </div>
                                <div>
                                    <label htmlFor={`hours-${index}`} className="block text-gray-700 text-xs font-bold mb-1">Hours:</label>
                                    <input
                                        type="text"
                                        id={`hours-${index}`}
                                        value={row.hours}
                                        onChange={(e) => handleTableDataChange(index, 'hours', e.target.value)}
                                        className="shadow appearance-none border rounded w-full py-1 px-2 text-gray-700 text-sm leading-tight focus:outline-none focus:shadow-outline"
                                    />
                                </div>
                                <div>
                                    <label htmlFor={`videographer-${index}`} className="block text-gray-700 text-xs font-bold mb-1">Videographer:</label>
                                    <input
                                        type="text"
                                        id={`videographer-${index}`}
                                        value={row.videographer}
                                        onChange={(e) => handleTableDataChange(index, 'videographer', e.target.value)}
                                        className="shadow appearance-none border rounded w-full py-1 px-2 text-gray-700 text-sm leading-tight focus:outline-none focus:shadow-outline"
                                    />
                                </div>
                                <div>
                                    <label htmlFor={`photographer-${index}`} className="block text-gray-700 text-xs font-bold mb-1">Photographer:</label>
                                    <input
                                        type="text"
                                        id={`photographer-${index}`}
                                        value={row.photographer}
                                        onChange={(e) => handleTableDataChange(index, 'photographer', e.target.value)}
                                        className="shadow appearance-none border rounded w-full py-1 px-2 text-gray-700 text-sm leading-tight focus:outline-none focus:shadow-outline"
                                    />
                                </div>
                            </div>
                        ))}

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">Optional Add-ons:</h3>
                        {quoteDetails.addOns.map((addOn, index) => (
                            <div key={addOn.id} className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3 p-3 border rounded-lg bg-white shadow-sm items-end">
                                <div className="md:col-span-2">
                                    <label htmlFor={`addon-desc-${index}`} className="block text-gray-700 text-xs font-bold mb-1">Description:</label>
                                    <input
                                        type="text"
                                        id={`addon-desc-${index}`}
                                        value={addOn.description}
                                        onChange={(e) => handleAddOnInputChange(index, 'description', e.target.value)}
                                        className="shadow appearance-none border rounded w-full py-1 px-2 text-gray-700 text-sm leading-tight focus:outline-none focus:shadow-outline"
                                        placeholder="e.g., Second Videographer"
                                    />
                                </div>
                                <div>
                                    <label htmlFor={`addon-price-${index}`} className="block text-gray-700 text-xs font-bold mb-1">Price ($):</label>
                                    <input
                                        type="number"
                                        id={`addon-price-${index}`}
                                        value={addOn.price}
                                        onChange={(e) => handleAddOnInputChange(index, 'price', e.target.value)}
                                        className="shadow appearance-none border rounded w-full py-1 px-2 text-gray-700 text-sm leading-tight focus:outline-none focus:shadow-outline"
                                    />
                                </div>
                                <div>
                                    <label htmlFor={`addon-hours-${index}`} className="block text-gray-700 text-xs font-bold mb-1">Hours:</label>
                                    <input
                                        type="number"
                                        id={`addon-hours-${index}`}
                                        value={addOn.hours}
                                        onChange={(e) => handleAddOnInputChange(index, 'hours', e.target.value)}
                                        className="shadow appearance-none border rounded w-full py-1 px-2 text-gray-700 text-sm leading-tight focus:outline-none focus:shadow-outline"
                                    />
                                </div>
                                <button
                                    onClick={() => handleRemoveAddOn(addOn.id)}
                                    className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-2 rounded text-sm transition duration-200"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={handleAddAddOn}
                            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg text-sm mt-2 transition duration-200"
                        >
                            Add Add-on
                        </button>

                        <div className="mt-6 text-center">
                            <button
                                onClick={saveQuote}
                                disabled={isLoading || !firebaseDb}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
                                    <div className="flex items-center justify-center">
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Saving Quote...
                                    </div>
                                ) : (
                                    'Save Quote & Generate URL'
                                )}
                            </button>
                            {apiError && <p className="text-red-500 mt-3">{apiError}</p>}
                        </div>
                    </div>
                )}

                {/* Display Area for Quote Details (visible when viewing an existing quote or after saving) */}
                {(isViewingQuote || generatedQuoteUrl) && (
                    <div className="mb-8 p-6 bg-white rounded-lg shadow-inner border border-gray-200">
                        <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                            Quote for <span className="text-indigo-600">{quoteDetails.clientName}</span>
                        </h2>

                        {generatedQuoteUrl && (
                            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">
                                <strong className="font-bold">Quote URL Generated! </strong>
                                <span className="block sm:inline">Share this link with your client:</span>
                                <div className="flex items-center mt-2">
                                    <a href={generatedQuoteUrl} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600 hover:underline flex-grow font-mono text-sm">
                                        {generatedQuoteUrl}
                                    </a>
                                    <button
                                        onClick={() => copyToClipboard(generatedQuoteUrl)}
                                        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-1 px-2 rounded-md text-xs ml-3 transition duration-200"
                                        title="Copy URL"
                                    >
                                        {copyMessage === 'Copied to clipboard!' ? 'Copied!' : 'Copy URL'}
                                    </button>
                                </div>
                                {copyMessage && copyMessage !== 'Copied to clipboard!' && <p className="text-red-500 mt-1 text-sm">{copyMessage}</p>}
                            </div>
                        )}

                        <p className="text-gray-700 text-lg leading-relaxed mb-2">
                            Hi <span className="font-semibold text-gray-900">{quoteDetails.clientName}</span>,
                        </p>
                        <p className="text-gray-700 text-lg leading-relaxed mt-2 mb-6">
                            Based on our talk yesterday, here's a quote for photo + video if you'd like to go that route.
                        </p>

                        {/* Value Proposition / Inclusions Section */}
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg mb-8 shadow-inner">
                            <h2 className="text-2xl font-semibold text-indigo-700 mb-4">What's Included:</h2>
                            <ul className="list-disc list-inside text-gray-700 text-lg space-y-2">
                                {quoteDetails.inclusions.map((item, index) => (
                                    <li key={item.id || index} className="flex items-center">
                                        <svg className="w-5 h-5 text-indigo-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                                        </svg>
                                        <span>{item.text} {item.isValueAdded && <span className="text-sm text-indigo-600 ml-1">(${item.value} value)</span>}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Package Details and Pricing Section */}
                        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                                Package: <span className="text-indigo-600">{quoteDetails.packageName}</span>
                            </h2>

                            {/* Coverage Table */}
                            <div className="overflow-x-auto mb-6">
                                <table className="min-w-full bg-white border border-gray-300 rounded-lg">
                                    <thead>
                                        <tr className="bg-gray-100 text-left text-gray-600 uppercase text-sm leading-normal">
                                            <th className="py-3 px-6 border-b border-gray-300 rounded-tl-lg">Day</th>
                                            <th className="py-3 px-6 border-b border-gray-300">Hours</th>
                                            <th className="py-3 px-6 border-b border-gray-300">Videographer</th>
                                            <th className="py-3 px-6 border-b border-gray-300 rounded-tr-lg">Photographer</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-gray-700 text-base font-light">
                                        {quoteDetails.tableData.map((row, index) => (
                                            <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                                                <td className="py-3 px-6 whitespace-nowrap">{row.day}</td>
                                                <td className="py-3 px-6 whitespace-nowrap">{row.hours}</td>
                                                <td className="py-3 px-6 whitespace-nowrap">{row.videographer}</td>
                                                <td className="py-3 px-6 whitespace-nowrap">{row.photographer}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Optional Add-ons */}
                            {quoteDetails.addOns.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="text-xl font-semibold text-gray-800 mb-3">Optional Add-ons:</h3>
                                    {quoteDetails.addOns.map(addOn => (
                                        <div key={addOn.id} className="flex items-center text-lg text-gray-700 mb-2">
                                            <label htmlFor={addOn.id}>
                                                {addOn.description} <span className="font-semibold">${addOn.price}/{addOn.hours} hours</span>
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Total Price */}
                            <div className="text-right mt-8">
                                <p className="text-3xl font-bold text-gray-900">
                                    Total Price: <span className="text-indigo-700">${calculateTotalPrice()}</span>
                                </p>
                                <p className="text-lg text-gray-600 mt-1">(Base Package: ${quoteDetails.basePrice})</p>
                            </div>
                        </div>

                        {/* Gemini API Feature Button (only shown when viewing a quote) */}
                        <div className="mt-8 text-center">
                            <button
                                onClick={generateFollowUpEmail}
                                disabled={isLoading}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
                                    <div className="flex items-center justify-center">
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Generating Email...
                                    </div>
                                ) : (
                                    '✨ Generate Follow-Up Email ✨'
                                )}
                            </button>
                            {apiError && <p className="text-red-500 mt-3">{apiError}</p>}
                        </div>

                        {/* Button to create a new quote if viewing */}
                        {isViewingQuote && (
                            <div className="mt-8 text-center border-t pt-6 border-gray-200">
                                <button
                                    onClick={() => {
                                        setIsViewingQuote(false);
                                        setCurrentQuoteId('');
                                        setGeneratedQuoteUrl('');
                                        setQuoteDetails({ // Reset for new quote creation
                                            clientName: '', packageName: 'Custom Package', basePrice: 0, addOns: [],
                                            inclusions: [
                                                { id: 'droneUpgrade', text: 'Drone upgrade included', value: 450, isValueAdded: true },
                                                { id: 'highRes', text: 'High-resolution Photos and Videos', isValueAdded: false },
                                                { id: 'shootsWithinTimeframe', text: 'Photo shoots and video shoots within the above-mentioned time frame', isValueAdded: false },
                                                { id: 'highlightsFilm', text: '1 combined or separate wedding highlights film of all the events', isValueValueAdded: false },
                                                { id: 'fullLengthVideo', text: 'Separate full-length edited video of the day', isValueAdded: false },
                                                { id: 'onlineDeliveryApproval', text: 'Online video and photo delivery for approval', isValueAdded: false },
                                                { id: 'finalDelivery', text: 'Final Videos and Photos delivered in an online link or on a USB', isValueAdded: false }
                                            ],
                                            tableData: [
                                                { day: 'Day 1', hours: '4 hours', videographer: '1 Videographer (2 cameras)', photographer: '1 Photographer' },
                                                { day: 'Day 2', hours: '10 hours', videographer: '1 Videographer (2 cameras)', photographer: '1 Photographer' }
                                            ],
                                            companyEmail: 'info@thesparkstudios.ca'
                                        });
                                    }}
                                    className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300"
                                >
                                    Create New Quote
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer Section */}
                <div className="mt-8 text-center border-t pt-6 border-gray-200">
                    <p className="text-gray-700 text-lg leading-relaxed mb-4">
                        If you have any questions, feel free to reach out.
                    </p>
                    <p className="text-xl font-semibold text-gray-800">Best regards,</p>
                    <p className="text-lg text-gray-700">The Spark Studios</p>
                    <a href={`mailto:${quoteDetails.companyEmail}`} className="text-indigo-600 hover:underline text-lg">
                        {quoteDetails.companyEmail}
                    </a>
                </div>
            </div>

            {/* Email Draft Modal */}
            {showEmailModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl transform transition-all scale-100 opacity-100">
                        <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                            Generated Email Draft
                            <svg className="w-6 h-6 text-yellow-500 ml-2" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"></path>
                                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"></path>
                            </svg>
                        </h3>
                        <div className="relative mb-4">
                            <textarea
                                className="w-full p-4 border border-gray-300 rounded-lg bg-gray-50 font-mono text-gray-800 text-sm leading-relaxed h-80 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                value={emailDraft}
                                readOnly
                            ></textarea>
                            <button
                                onClick={() => copyToClipboard(emailDraft)}
                                className="absolute top-2 right-2 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-1.5 px-3 rounded-md text-xs shadow-sm transition duration-200 ease-in-out"
                                title="Copy to Clipboard"
                            >
                                {copyMessage ? copyMessage : 'Copy'}
                            </button>
                        </div>
                        <div className="flex justify-end">
                            <button
                                onClick={() => { setShowEmailModal(false); setEmailDraft(''); setCopyMessage(''); }}
                                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-200 ease-in-out"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
