import React from 'react';

const Matrix = () => {
    return (
        <div>
            {/* Other components */}
            {/* Ensure only one 'Add homework' button is present */}
            <button onClick={handleAddHomework}>+ Eigen taak toevoegen</button>
        </div>
    );
};

const handleAddHomework = () => {
    // Logic to add homework
};

export default Matrix;