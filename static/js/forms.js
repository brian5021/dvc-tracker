export class FormValidator {
    static validateStayForm(formData) {
        const errors = [];
        const checkIn = new Date(formData.get('check_in'));
        const checkOut = new Date(formData.get('check_out'));

        if (checkOut <= checkIn) {
            errors.push('Check-out date must be after check-in date');
        }

        const pointsCost = parseInt(formData.get('points_cost'));
        if (pointsCost <= 0) {
            errors.push('Points cost must be greater than 0');
        }

        return errors;
    }
}
