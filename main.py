from flask import Flask, render_template, jsonify, request, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date, timedelta
import os
import re
from sqlalchemy import func, extract

app = Flask(__name__)
app.secret_key = 'dev-secret-key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///dvc_points.db'
db = SQLAlchemy(app)

class Contract(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    use_year_start = db.Column(db.Integer, nullable=False)  # 9 for September
    total_points = db.Column(db.Integer, nullable=False)    # 230 points

class Member(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    point_allocations = db.relationship('PointAllocation', backref='member', lazy=True)

class PointAllocation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    origin_year = db.Column(db.Integer, nullable=False)  # The year these points originated from
    use_year = db.Column(db.Integer, nullable=False)    # The year these points must be used by
    points = db.Column(db.Integer, nullable=False)
    is_banked = db.Column(db.Boolean, default=False)    # True if these are banked points
    is_borrowed = db.Column(db.Boolean, default=False)  # True if these are borrowed points
    banking_deadline = db.Column(db.Date)               # Deadline to bank these points

class StayMember(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    stay_id = db.Column(db.Integer, db.ForeignKey('stay.id'), nullable=False)
    member_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    points_share = db.Column(db.Integer, nullable=False)  # Points allocated to this member
    member = db.relationship('Member', backref='stay_members', lazy=True)

class Stay(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    resort = db.Column(db.String(100), nullable=False)
    check_in = db.Column(db.Date, nullable=False)
    check_out = db.Column(db.Date, nullable=False)
    points_cost = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), nullable=False)  # 'planned' or 'booked'
    members = db.relationship('StayMember', backref='stay', lazy=True)
    stay_guests = db.relationship('StayGuest', backref='stay', lazy=True)
    additional_guests = db.relationship('AdditionalGuest',
                                     secondary='stay_additional_guest',
                                     backref=db.backref('stays', lazy=True))

    def update_status(self, new_status):
        old_status = self.status
        self.status = new_status

        # If changing to Booked, deduct points
        if new_status == 'Booked' and old_status != 'Booked':
            for stay_member in self.members:
                member = stay_member.member
                points_needed = stay_member.points_share

                # Find point allocation for the use year
                use_year = self.check_in.year
                allocation = PointAllocation.query.filter_by(
                    member_id=member.id,
                    use_year=use_year,
                    is_banked=False
                ).first()

                if allocation and allocation.points >= points_needed:
                    allocation.points -= points_needed
                else:
                    raise ValueError(f"Insufficient points for member {member.name}")

        # If changing from Booked to something else, return points
        elif old_status == 'Booked' and new_status != 'Booked':
            for stay_member in self.members:
                member = stay_member.member
                points_to_return = stay_member.points_share

                # Find point allocation for the use year
                use_year = self.check_in.year
                allocation = PointAllocation.query.filter_by(
                    member_id=member.id,
                    use_year=use_year,
                    is_banked=False
                ).first()

                if allocation:
                    allocation.points += points_to_return
                else:
                    # Create new allocation if none exists
                    allocation = PointAllocation(
                        member_id=member.id,
                        use_year=use_year,
                        points=points_to_return,
                        is_banked=False
                    )
                    db.session.add(allocation)

    def validate_booking(self):
        """Validate that all members have sufficient points before booking"""
        for stay_member in self.members:
            member = stay_member.member
            points_needed = stay_member.points_share

            # Find point allocation for the use year
            allocation = PointAllocation.query.filter_by(
                member_id=member.id,
                use_year=self.check_in.year,
                is_banked=False
            ).first()

            if not allocation or allocation.points < points_needed:
                raise ValueError(f"Insufficient points for member {member.name}")

class ActivityLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    action_type = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(500), nullable=False)
    member1_id = db.Column(db.Integer, db.ForeignKey('member.id'))
    member2_id = db.Column(db.Integer, db.ForeignKey('member.id'))
    stay_id = db.Column(db.Integer, db.ForeignKey('stay.id'))

    member1 = db.relationship('Member', foreign_keys=[member1_id])
    member2 = db.relationship('Member', foreign_keys=[member2_id])
    stay = db.relationship('Stay', foreign_keys=[stay_id])

class PointLoan(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lender_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    borrower_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    points = db.Column(db.Integer, nullable=False)  # Can be positive or negative to track net points
    use_year = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.now)

    lender = db.relationship('Member', foreign_keys=[lender_id])
    borrower = db.relationship('Member', foreign_keys=[borrower_id])

class PointBalance(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    member1_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    member2_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    use_year = db.Column(db.Integer, nullable=False)
    points = db.Column(db.Integer, nullable=False)  # Positive means member1 owes member2, negative means member2 owes member1
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    member1 = db.relationship('Member', foreign_keys=[member1_id])
    member2 = db.relationship('Member', foreign_keys=[member2_id])

class AdditionalGuest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)

# Association table for Stay and AdditionalGuest
stay_additional_guest = db.Table('stay_additional_guest',
    db.Column('stay_id', db.Integer, db.ForeignKey('stay.id'), primary_key=True),
    db.Column('guest_id', db.Integer, db.ForeignKey('additional_guest.id'), primary_key=True)
)

# Add these new routes:
@app.route('/api/stays', methods=['GET'])
def get_stays():
    stays = Stay.query.all()
    results = []
    for stay in stays:
        stay_members = []
        for stay_member in stay.members:
            member = Member.query.get(stay_member.member_id)
            stay_members.append({
                'name': member.name,
                'points_share': stay_member.points_share
            })

        results.append({
            'id': stay.id,
            'members': stay_members,
            'resort': stay.resort,
            'check_in': stay.check_in.strftime('%Y-%m-%d'),
            'check_out': stay.check_out.strftime('%Y-%m-%d'),
            'points_cost': stay.points_cost,
            'status': stay.status
        })
    return jsonify(results)

def validate_member_points(member_id, points_needed, is_banked=False):
    """Helper function to check if a member has enough points"""
    point_allocation = PointAllocation.query.filter_by(
        member_id=member_id,
        use_year=2024,
        is_banked=is_banked
    ).first()

    available_points = point_allocation.points if point_allocation else 0
    return available_points >= points_needed

@app.route('/api/stays', methods=['POST'])
def add_stay():
    try:
        data = request.get_json()

        # Create the stay
        stay = Stay(
            resort=data['resort'],
            check_in=datetime.strptime(data['check_in'], '%Y-%m-%d').date(),
            check_out=datetime.strptime(data['check_out'], '%Y-%m-%d').date(),
            points_cost=data['points_cost'],
            status='Planned'  # Always start as planned
        )
        db.session.add(stay)
        db.session.flush()  # Get the stay ID

        # Add stay members
        for member_data in data['members']:
            stay_member = StayMember(
                stay_id=stay.id,
                member_id=member_data['member_id'],
                points_share=member_data['points_share']
            )
            db.session.add(stay_member)

        # If status should be booked, update it after creating all relationships
        if data['status'] == 'Booked':
            stay.update_status('Booked')  # This will trigger point deduction

        db.session.commit()
        return jsonify({'success': True, 'stay_id': stay.id})

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/members')
def get_members():
    members = Member.query.all()
    return jsonify([{'id': m.id, 'name': m.name} for m in members])

@app.route('/')
def home():
    current_year = datetime.now().year
    members = Member.query.all()

    # Get contract to determine Use Year dates
    contract = Contract.query.first()
    use_year_start_month = contract.use_year_start if contract else 9  # Default to September

    # Calculate important dates
    use_year_start = date(current_year, use_year_start_month, 1)
    use_year_end = date(current_year + 1, use_year_start_month, 1) - timedelta(days=1)
    banking_deadline = use_year_end - timedelta(days=120)  # 4 months before end
    next_year_start = date(current_year + 1, use_year_start_month, 1)

    # Get point allocations for all members
    point_allocations = {}
    for member in members:
        point_allocations[member.id] = {current_year: {}}

        # Get regular points
        regular = PointAllocation.query.filter_by(
            member_id=member.id,
            use_year=current_year,
            is_banked=False,
            is_borrowed=False
        ).first()
        point_allocations[member.id][current_year]['regular'] = regular

        # Get banked points
        banked = PointAllocation.query.filter_by(
            member_id=member.id,
            use_year=current_year,
            is_banked=True
        ).first()
        point_allocations[member.id][current_year]['banked'] = banked

        # Get borrowed points
        borrowed = PointAllocation.query.filter_by(
            member_id=member.id,
            use_year=current_year,
            is_borrowed=True
        ).first()
        point_allocations[member.id][current_year]['borrowed'] = borrowed

    # Calculate points used for each member
    points_used = {}
    for member in members:
        points_used[member.id] = calculate_points_used(member.id, current_year)

    # Get next year's available points for borrowing
    next_year_points = {}
    for member in members:
        next_year_allocation = PointAllocation.query.filter_by(
            member_id=member.id,
            use_year=current_year + 1,
            is_banked=False,
            is_borrowed=False
        ).first()
        next_year_points[member.id] = next_year_allocation.points if next_year_allocation else 0

    return render_template('index.html',
                         members=members,
                         current_year=current_year,
                         point_allocations=point_allocations,
                         points_used=points_used,
                         next_year_points=next_year_points,
                         banking_deadline=banking_deadline,
                         use_year_end=use_year_end,
                         next_year_start=next_year_start,
                         now=datetime.now().date())

def get_use_year(date):
    """Helper function to determine the use year for a given date.
    If the date is September 1st or later, it uses that year's points.
    If the date is before September 1st, it uses the previous year's points."""
    if date.month >= 9:  # September or later
        return date.year
    else:  # January through August
        return date.year - 1

@app.route('/api/stays/<int:stay_id>/status', methods=['POST'])
def update_stay_status(stay_id):
    try:
        stay = Stay.query.get_or_404(stay_id)
        new_status = request.form.get('status')

        if new_status not in ['planned', 'booked']:
            return jsonify({'error': 'Invalid status'}), 400

        # If marking as booked, deduct points from members
        if new_status == 'booked':
            # Determine which use year's points to deduct based on check-in date
            use_year = get_use_year(stay.check_in)

            for stay_member in stay.members:
                # Get the member's point allocation
                point_allocation = PointAllocation.query.filter_by(
                    member_id=stay_member.member_id,
                    use_year=use_year,
                    is_banked=False
                ).first()

                if not point_allocation or point_allocation.points < stay_member.points_share:
                    return jsonify({
                        'error': f'{stay_member.member.name} does not have enough {use_year} points. ' +
                                f'Needed: {stay_member.points_share}, ' +
                                f'Available: {point_allocation.points if point_allocation else 0}'
                    }), 400

                # Deduct the points
                point_allocation.points -= stay_member.points_share

        stay.status = new_status

        # Log the activity with all involved members
        member_descriptions = [f"{m.member.name} ({m.points_share} pts)" for m in stay.members]
        use_year_str = f" using {get_use_year(stay.check_in)} points" if new_status == 'booked' else ""
        log = ActivityLog(
            action_type='stay_booked' if new_status == 'booked' else 'stay_status_updated',
            description=f"Stay at {stay.resort} {new_status} for {', '.join(member_descriptions)}{use_year_str}",
            member1_id=stay.members[0].member_id if stay.members else None,
            member2_id=stay.members[1].member_id if len(stay.members) > 1 else None,
            stay_id=stay.id
        )
        db.session.add(log)

        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/stays/<int:stay_id>', methods=['PUT'])
def update_stay(stay_id):
    data = request.get_json()
    try:
        stay = Stay.query.get_or_404(stay_id)
        old_status = stay.status

        # Update basic stay info
        stay.resort = data['resort']
        stay.check_in = datetime.strptime(data['check_in'], '%Y-%m-%d')
        stay.check_out = datetime.strptime(data['check_out'], '%Y-%m-%d')
        stay.points_cost = data['points_cost']

        # Validate total points
        total_points = sum(m['points_share'] for m in data['members'])
        if total_points != data['points_cost']:
            raise ValueError("Total point shares must equal stay cost")

        # Update member shares
        StayMember.query.filter_by(stay_id=stay_id).delete()
        for member_data in data['members']:
            member_share = StayMember(
                stay_id=stay_id,
                member_id=member_data['member_id'],
                points_share=member_data['points_share']
            )
            db.session.add(member_share)

        # Update guests
        StayGuest.query.filter_by(stay_id=stay_id).delete()
        for guest_id in data.get('guests', []):
            stay_guest = StayGuest(
                stay_id=stay_id,
                guest_id=guest_id
            )
            db.session.add(stay_guest)

        # Handle status change
        new_status = data.get('status', 'Planned')
        if new_status != old_status:
            stay.update_status(new_status)

        db.session.commit()
        return jsonify({'message': 'Stay updated successfully'})

    except Exception as e:
        db.session.rollback()
        print(f"Error updating stay: {str(e)}")
        return jsonify({'error': str(e)}), 400

@app.route('/bank_points/<int:member_id>/<int:use_year>', methods=['GET', 'POST'])
def bank_points(member_id, use_year):
    if request.method == 'POST':
        try:
            points = int(request.form['points_to_bank'])
            member = Member.query.get_or_404(member_id)

            # Get regular points allocation
            regular_allocation = PointAllocation.query.filter_by(
                member_id=member_id,
                use_year=use_year,
                is_banked=False
            ).first()

            # Get or create banked points allocation
            banked_allocation = PointAllocation.query.filter_by(
                member_id=member_id,
                use_year=use_year,
                is_banked=True
            ).first()

            if not banked_allocation:
                banked_allocation = PointAllocation(
                    member_id=member_id,
                    use_year=use_year,
                    points=0,
                    is_banked=True
                )
                db.session.add(banked_allocation)

            if regular_allocation and points <= regular_allocation.points:
                # Deduct from regular points
                regular_allocation.points -= points
                # Add to banked points
                banked_allocation.points += points

                # Log the activity
                log_entry = ActivityLog(
                    action_type='points_banked',
                    description=f'{member.name} banked {points} points from {use_year}',
                    member1_id=member_id,
                    timestamp=datetime.now()
                )
                db.session.add(log_entry)
                db.session.commit()

                return redirect(url_for('home'))  # Redirect to home

        except Exception as e:
            db.session.rollback()
            flash(f'Error banking points: {str(e)}', 'error')
            return redirect(url_for('home'))

    # GET request shows the banking form
    member = Member.query.get_or_404(member_id)
    return render_template(
        'bank_points.html',
        member=member,
        use_year=use_year
    )

@app.route('/guests')
def manage_guests():
    guests = AdditionalGuest.query.all()
    return render_template('guests.html', guests=guests)

@app.route('/api/undo_last_action', methods=['POST'])
def undo_last_action():
    try:
        # Skip past any 'undo' actions to find the last real action
        last_action = ActivityLog.query.filter(
            ActivityLog.action_type != 'undo'
        ).order_by(ActivityLog.id.desc()).first()

        if not last_action:
            return jsonify({'error': 'No actions to undo'}), 400

        # Check if this action has already been undone
        already_undone = ActivityLog.query.filter(
            ActivityLog.action_type == 'undo',
            ActivityLog.description.like(f'Undid action: {last_action.description}%')
        ).first()

        if already_undone:
            return jsonify({'error': 'This action has already been undone'}), 400

        if last_action.action_type == 'points_banked':
            member = Member.query.get(last_action.member1_id)
            if not member:
                return jsonify({'error': 'Member not found'}), 400

            current_year = get_use_year(date.today())

            regular_points = PointAllocation.query.filter_by(
                member_id=member.id,
                use_year=current_year,
                is_banked=False
            ).first()

            banked_points = PointAllocation.query.filter_by(
                member_id=member.id,
                use_year=current_year,
                is_banked=True
            ).first()

            if not banked_points:
                return jsonify({'error': 'Banked points allocation not found'}), 400

            try:
                points_amount = int(last_action.description.split(' banked ')[1].split(' points')[0])
            except (IndexError, ValueError):
                return jsonify({'error': 'Invalid action description format'}), 400

            # Verify banked points has enough points to return
            if banked_points.points < points_amount:
                return jsonify({'error': 'Not enough banked points to undo this action'}), 400

            if not regular_points:
                regular_points = PointAllocation(
                    member_id=member.id,
                    use_year=current_year,
                    points=0,
                    is_banked=False
                )
                db.session.add(regular_points)

            regular_points.points += points_amount
            banked_points.points -= points_amount

        elif last_action.action_type == 'stay_booked':
            stay = Stay.query.get(last_action.stay_id)
            if not stay:
                return jsonify({'error': 'Stay not found'}), 400

            if stay.status != 'booked':
                return jsonify({'error': 'Stay is not in booked status'}), 400

            stay.status = 'planned'

            # Return points to members
            use_year = get_use_year(stay.check_in)
            for stay_member in stay.members:
                point_allocation = PointAllocation.query.filter_by(
                    member_id=stay_member.member_id,
                    use_year=use_year,
                    is_banked=False
                ).first()

                if not point_allocation:
                    point_allocation = PointAllocation(
                        member_id=stay_member.member_id,
                        use_year=use_year,
                        points=0,
                        is_banked=False
                    )
                    db.session.add(point_allocation)

                point_allocation.points += stay_member.points_share

        elif last_action.action_type == 'stay_created':
            stay = Stay.query.get(last_action.stay_id)
            if not stay:
                return jsonify({'error': 'Stay not found'}), 400

            # If stay was booked, return points first
            if stay.status == 'booked':
                use_year = get_use_year(stay.check_in)
                for stay_member in stay.members:
                    point_allocation = PointAllocation.query.filter_by(
                        member_id=stay_member.member_id,
                        use_year=use_year,
                        is_banked=False
                    ).first()

                    if point_allocation:
                        point_allocation.points += stay_member.points_share

            # Remove guest associations
            stay.additional_guests = []

            # Delete associated stay members
            StayMember.query.filter_by(stay_id=stay.id).delete()
            db.session.delete(stay)

        else:
            return jsonify({'error': f'Cannot undo action type: {last_action.action_type}'}), 400

        # Log the undo action with timestamp reference
        undo_log = ActivityLog(
            action_type='undo',
            description=f"Undid action: {last_action.description} (original timestamp: {last_action.timestamp})",
            member1_id=last_action.member1_id,
            member2_id=last_action.member2_id,
            stay_id=last_action.stay_id
        )
        db.session.add(undo_log)
        db.session.commit()

        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/stays/<int:stay_id>', methods=['GET'])
def get_stay(stay_id):
    stay = Stay.query.get_or_404(stay_id)

    # Get guest point allocations
    stay.guest_points = {}
    for guest in stay.additional_guests:
        guest_points = GuestPoints.query.filter_by(
            stay_id=stay.id,
            guest_id=guest.id
        ).all()

        stay.guest_points[guest.id] = {
            'total': sum(gp.points for gp in guest_points),
            **{gp.member_id: gp.points for gp in guest_points}
        }

    return jsonify(stay.to_dict())

@app.route('/stays/new', methods=['GET', 'POST'])
def new_stay():
    if request.method == 'GET':
        members = Member.query.all()
        guests = AdditionalGuest.query.all()
        return render_template('new_stay.html',
                            members=members,
                            guests=guests)

    # Handle POST request
    data = request.get_json()
    try:
        # Create the stay
        stay = Stay(
            resort=data['resort'],
            check_in=datetime.strptime(data['check_in'], '%Y-%m-%d'),
            check_out=datetime.strptime(data['check_out'], '%Y-%m-%d'),
            points_cost=data['points_cost'],
            status=data.get('status', 'Planned')  # Default to Planned if not specified
        )
        db.session.add(stay)
        db.session.flush()  # This gets us the stay.id

        # Validate total points
        total_points = sum(m['points_share'] for m in data['members'])
        if total_points != data['points_cost']:
            raise ValueError("Total point shares must equal stay cost")

        # Add member shares
        for member_data in data['members']:
            member_share = StayMember(
                stay_id=stay.id,
                member_id=member_data['member_id'],
                points_share=member_data['points_share']
            )
            db.session.add(member_share)

        # Add guests if any
        for guest_id in data.get('guests', []):
            stay_guest = StayGuest(
                stay_id=stay.id,
                guest_id=guest_id
            )
            db.session.add(stay_guest)

        # If status is Booked, deduct points
        if stay.status == 'Booked':
            stay.update_status('Booked')

        # Log the activity
        log = ActivityLog(
            action_type='stay_created',
            description=f'Stay created at {stay.resort}',
            timestamp=datetime.now()
        )
        db.session.add(log)

        db.session.commit()
        return jsonify({'message': 'Stay created successfully'})

    except Exception as e:
        db.session.rollback()
        print(f"Error creating stay: {str(e)}")
        return jsonify({'error': str(e)}), 400

@app.route('/stays/<int:stay_id>/edit', methods=['GET'])
def edit_stay(stay_id):
    stay = Stay.query.get_or_404(stay_id)
    members = Member.query.all()
    guests = AdditionalGuest.query.all()
    return render_template('edit_stay.html',
                         stay=stay,
                         members=members,
                         guests=guests)

class StayGuest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    stay_id = db.Column(db.Integer, db.ForeignKey('stay.id'), nullable=False)
    guest_id = db.Column(db.Integer, db.ForeignKey('additional_guest.id'), nullable=False)
    guest = db.relationship('AdditionalGuest')
    member_points = db.relationship('GuestPoints', backref='stay_guest', lazy=True)

class GuestPoints(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    stay_guest_id = db.Column(db.Integer, db.ForeignKey('stay_guest.id'), nullable=False)
    member_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    points = db.Column(db.Integer, nullable=False)
    member = db.relationship('Member')

def calculate_points_used(member_id, year):
    """Calculate total points used by a member in a given year, including guest contributions"""
    total_points = 0

    # Get points from direct stay memberships
    stay_points = db.session.query(
        func.sum(StayMember.points_share)
    ).join(Stay).filter(
        StayMember.member_id == member_id,
        extract('year', Stay.check_in) == year
    ).scalar() or 0

    # Get points contributed to guests
    guest_points = db.session.query(
        func.sum(GuestPoints.points)
    ).join(
        StayGuest, GuestPoints.stay_guest_id == StayGuest.id
    ).join(
        Stay, StayGuest.stay_id == Stay.id
    ).filter(
        GuestPoints.member_id == member_id,
        extract('year', Stay.check_in) == year
    ).scalar() or 0

    total_points = stay_points + guest_points

    return total_points

def init_db():
    db.drop_all()
    db.create_all()

    # Create contract
    contract = Contract(use_year_start=9, total_points=230)  # September start, 230 points
    db.session.add(contract)
    db.session.commit()  # Commit contract first

    # Create members
    members = [
        Member(name='Brandon'),
        Member(name='Stephanie')
    ]
    for member in members:
        db.session.add(member)
    db.session.commit()  # Commit members to get their IDs

    # Create initial point allocations for current year
    current_year = datetime.now().year
    for member in members:
        allocation = PointAllocation(
            member_id=member.id,  # Now member.id will be available
            origin_year=current_year,
            use_year=current_year,
            points=152,
            is_banked=False,
            is_borrowed=False,
            banking_deadline=date(current_year, 5, 31)  # Example deadline
        )
        db.session.add(allocation)
    db.session.commit()  # Commit allocations

    # Create some test stays
    stay = Stay(
        resort='Disney\'s Beach Club Villas',
        check_in=date(2024, 6, 1),
        check_out=date(2024, 6, 8),
        points_cost=100,
        status='planned'
    )
    db.session.add(stay)
    db.session.commit()  # Commit stay to get ID

    # Add stay members
    stay_member = StayMember(
        stay_id=stay.id,
        member_id=members[0].id,
        points_share=100
    )
    db.session.add(stay_member)

    # Create some additional guests
    guests = [
        AdditionalGuest(name='John Doe'),
        AdditionalGuest(name='Jane Smith')
    ]
    for guest in guests:
        db.session.add(guest)

    db.session.commit()  # Final commit for remaining objects

@app.route('/point-sharing')
def view_loans():
    current_year = get_use_year(date.today())
    members = Member.query.all()
    point_shares = get_point_sharing_summary()

    # Calculate points used for each member
    points_used = {}
    for member in members:
        points_used[member.id] = calculate_points_used(member.id, current_year)

    # Get point allocations for all members
    point_allocations = {}
    for member in members:
        point_allocations[member.id] = {current_year: {}}

        # Get regular points
        regular = PointAllocation.query.filter_by(
            member_id=member.id,
            use_year=current_year,
            is_banked=False
        ).first()
        point_allocations[member.id][current_year]['regular'] = regular

        # Get banked points
        banked = PointAllocation.query.filter_by(
            member_id=member.id,
            use_year=current_year,
            is_banked=True
        ).first()
        point_allocations[member.id][current_year]['banked'] = banked

    # Get recent activity
    activities = ActivityLog.query.filter(
        ActivityLog.action_type.in_(['points_transferred'])
    ).order_by(ActivityLog.timestamp.desc()).limit(10).all()

    return render_template('loans.html',
                         members=members,
                         current_year=current_year,
                         point_allocations=point_allocations,
                         point_shares=point_shares,
                         points_used=points_used,
                         activities=activities)

def get_point_sharing_summary():
    members = Member.query.all()
    summary = {}

    # Initialize summary for all members
    for member in members:
        summary[member.id] = {
            'shared': 0,
            'borrowed': 0
        }

    # Get all point sharing records
    shares = PointLoan.query.all()

    # Update summary with actual sharing data
    for share in shares:
        summary[share.lender_id]['shared'] += share.points
        summary[share.borrower_id]['borrowed'] += share.points

    return summary

@app.route('/activity')
def activity_log():  # This function name needs to match what's in url_for()
    activity_type = request.args.get('type', 'all')
    member_id = request.args.get('member_id', 'all')

    # Get all unique activity types for the filter dropdown
    activity_types = db.session.query(ActivityLog.action_type).distinct().all()
    activity_types = [t[0] for t in activity_types]

    # Get all members for the filter dropdown
    members = Member.query.all()

    # Build the query
    query = ActivityLog.query

    # Filter by activity type if specified
    if activity_type and activity_type != 'all':
        query = query.filter_by(action_type=activity_type)

    # Filter by member if specified
    if member_id and member_id != 'all':
        member_id = int(member_id)
        query = query.filter(
            db.or_(
                ActivityLog.member1_id == member_id,
                ActivityLog.member2_id == member_id
            )
        )

    # Get the filtered logs
    logs = query.order_by(ActivityLog.timestamp.desc()).all()

    return render_template('activity.html',
                         logs=logs,
                         activity_types=activity_types,
                         members=members,
                         selected_type=activity_type,
                         selected_member=member_id)

@app.route('/api/loans', methods=['POST'])
def create_loan():
    try:
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form

        lender_id = int(data['lender_id'])
        borrower_id = int(data['borrower_id'])
        points = int(data['points'])
        use_year = int(data['use_year'])

        # Create the point sharing record
        loan = PointLoan(
            lender_id=lender_id,
            borrower_id=borrower_id,
            points=points,
            use_year=use_year
        )
        db.session.add(loan)

        # Log the activity
        lender = Member.query.get(lender_id)
        borrower = Member.query.get(borrower_id)
        log_entry = ActivityLog(
            action_type='point_share',
            description=f'{lender.name} shared {points} points with {borrower.name} for {use_year}',
            member1_id=lender_id,
            member2_id=borrower_id,
            timestamp=datetime.now()
        )
        db.session.add(log_entry)

        db.session.commit()
        return jsonify({'message': 'Point sharing recorded successfully'})

    except Exception as e:
        db.session.rollback()
        print(f"Error recording point share: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/guests', methods=['POST'])
def add_guest():
    try:
        name = request.form.get('name')
        if not name:
            flash('Guest name is required', 'error')
            return redirect(url_for('manage_guests'))

        guest = AdditionalGuest(name=name)
        db.session.add(guest)

        # Log the activity
        log = ActivityLog(
            action_type='add_guest',
            description=f'Added guest: {name}',
            timestamp=datetime.now()
        )
        db.session.add(log)

        db.session.commit()
        flash('Guest added successfully', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error adding guest: {str(e)}', 'error')

    return redirect(url_for('manage_guests'))

@app.route('/api/guests/<int:guest_id>', methods=['POST'])
def remove_guest(guest_id):
    try:
        guest = AdditionalGuest.query.get_or_404(guest_id)

        # Check if guest is associated with any stays
        has_stays = Stay.query.join(Stay.additional_guests).filter(
            AdditionalGuest.id == guest_id
        ).first() is not None

        if has_stays:
            flash('Cannot remove guest that is associated with stays', 'error')
            return redirect(url_for('manage_guests'))

        # Log the removal
        log = ActivityLog(
            action_type='remove_guest',
            description=f'Removed guest: {guest.name}',
            timestamp=datetime.now()
        )
        db.session.add(log)

        # Remove the guest
        db.session.delete(guest)
        db.session.commit()

        flash('Guest removed successfully', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error removing guest: {str(e)}', 'error')

    return redirect(url_for('manage_guests'))

@app.route('/api/activity_logs')
def get_activity_logs():
    logs = ActivityLog.query.order_by(ActivityLog.timestamp.desc()).all()
    return jsonify([{
        'timestamp': log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
        'action_type': log.action_type,
        'description': log.description
    } for log in logs])

@app.route('/api/points/share', methods=['POST'])
def share_points():
    try:
        lender_id = int(request.form['lender_id'])
        borrower_id = int(request.form['borrower_id'])
        points = int(request.form['points'])
        use_year = int(request.form['use_year'])

        # Get lender's regular point allocation
        lender_allocation = PointAllocation.query.filter_by(
            member_id=lender_id,
            use_year=use_year,
            is_banked=False
        ).first()

        if not lender_allocation:
            flash('No points available to share', 'error')
            return redirect(url_for('view_loans'))

        # Calculate points already used in stays
        points_used = calculate_points_used(lender_id, use_year)

        # Calculate points already shared
        points_shared = db.session.query(func.sum(PointShare.points))\
            .filter(PointShare.lender_id == lender_id,
                   PointShare.use_year == use_year)\
            .scalar() or 0

        # Calculate available points
        available_points = lender_allocation.points - points_used - points_shared

        if available_points < points:
            flash(f'Insufficient points available to share. You have {available_points} points available.', 'error')
            return redirect(url_for('view_loans'))

        # Create point share record
        share = PointShare(
            lender_id=lender_id,
            borrower_id=borrower_id,
            points=points,
            use_year=use_year,
            timestamp=datetime.now()
        )
        db.session.add(share)

        # Update point allocations
        lender_allocation.points -= points

        # Get or create borrower allocation
        borrower_allocation = PointAllocation.query.filter_by(
            member_id=borrower_id,
            use_year=use_year,
            is_banked=False
        ).first()

        if not borrower_allocation:
            borrower_allocation = PointAllocation(
                member_id=borrower_id,
                use_year=use_year,
                points=0,
                is_banked=False
            )
            db.session.add(borrower_allocation)

        borrower_allocation.points += points

        # Log the activity
        lender = Member.query.get(lender_id)
        borrower = Member.query.get(borrower_id)
        log = ActivityLog(
            action_type='points_transferred',
            description=f'{lender.name} shared {points} points with {borrower.name}',
            member1_id=lender_id,
            member2_id=borrower_id,
            timestamp=datetime.now()
        )
        db.session.add(log)

        db.session.commit()
        flash(f'Successfully shared {points} points', 'success')

    except Exception as e:
        db.session.rollback()
        flash(f'Error sharing points: {str(e)}', 'error')

    return redirect(url_for('view_loans'))

class PointShare(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lender_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    borrower_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    points = db.Column(db.Integer, nullable=False)
    use_year = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.now)

    # Relationships
    lender = db.relationship('Member', foreign_keys=[lender_id], backref='points_shared')
    borrower = db.relationship('Member', foreign_keys=[borrower_id], backref='points_borrowed')

    def __repr__(self):
        return f'<PointShare {self.points} points from {self.lender_id} to {self.borrower_id}>'

@app.route('/borrow_points/<int:member_id>/<int:use_year>', methods=['POST'])
def borrow_points(member_id, use_year):
    try:
        points = int(request.form['points_to_borrow'])
        member = Member.query.get_or_404(member_id)

        # Get next year's allocation
        next_year = use_year + 1
        future_allocation = PointAllocation.query.filter_by(
            member_id=member_id,
            use_year=next_year,
            is_banked=False,
            is_borrowed=False
        ).first()

        if not future_allocation or future_allocation.points < points:
            flash('Insufficient points available to borrow', 'error')
            return redirect(url_for('home'))

        # Create borrowed points allocation
        borrowed_allocation = PointAllocation(
            member_id=member_id,
            origin_year=next_year,
            use_year=use_year,
            points=points,
            is_banked=False,
            is_borrowed=True
        )
        db.session.add(borrowed_allocation)

        # Deduct from future year's points
        future_allocation.points -= points

        # Log the activity
        log_entry = ActivityLog(
            action_type='points_borrowed',
            description=f'{member.name} borrowed {points} points from {next_year} to use in {use_year}',
            member1_id=member_id
        )
        db.session.add(log_entry)
        db.session.commit()

        flash(f'Successfully borrowed {points} points from {next_year}', 'success')
        return redirect(url_for('home'))

    except Exception as e:
        db.session.rollback()
        flash(f'Error borrowing points: {str(e)}', 'error')
        return redirect(url_for('home'))

if __name__ == '__main__':
    with app.app_context():
    # Delete the database file if it exists
        if os.path.exists('dvc_points.db'):
            os.remove('dvc_points.db')

        init_db()  # Initialize database with test data
        app.run(debug=True)  # Added debug=True to see any errors
