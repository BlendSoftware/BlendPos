package handler

import (
	"net/http"
	"reflect"

	"blendpos/internal/apierror"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/shopspring/decimal"
)

var validate = validator.New()

func init() {
	// Register decimal.Decimal as a numeric type so that validator tags like
	// min=0, gt=0, required work without panicking ("Bad field type decimal.Decimal").
	validate.RegisterCustomTypeFunc(func(field reflect.Value) interface{} {
		if v, ok := field.Interface().(decimal.Decimal); ok {
			f, _ := v.Float64()
			return f
		}
		return nil
	}, decimal.Decimal{})
}

// bindAndValidate binds JSON body and runs go-playground/validator tags.
// Returns false and writes the error response if validation fails —
// the caller should return immediately without writing another response.
func bindAndValidate(c *gin.Context, req interface{}) bool {
	if err := c.ShouldBindJSON(req); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("JSON invalido: "+err.Error()))
		return false
	}
	if err := validate.Struct(req); err != nil {
		fields := make(map[string]string)
		for _, fe := range err.(validator.ValidationErrors) {
			fields[fe.Field()] = fe.Tag()
		}
		c.JSON(http.StatusUnprocessableEntity, apierror.NewValidation(fields))
		return false
	}
	return true
}
